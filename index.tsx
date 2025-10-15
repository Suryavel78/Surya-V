import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Chat } from "@google/genai";

// --- DATA & INTERFACES ---

// Define interfaces for workout and workouts state to provide strong typing.
interface Workout {
    id: number;
    name: string;
    sets: number;
    reps: number;
    weight: string;
    completed: boolean;
    mediaUrl: string | null;
    duration: string;
    intensity: string;
}

interface DayWorkout {
    focus: string;
    exercises: Workout[];
}

type WorkoutsState = {
    [day: string]: DayWorkout;
};

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface LibraryExercise {
    id: number;
    name: string;
    muscleGroup: 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms' | 'Core';
    difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
    equipment: 'Barbell' | 'Dumbbell' | 'Machine' | 'Bodyweight' | 'Kettlebell';
}

const EXERCISE_LIBRARY_DATA: LibraryExercise[] = [
    { id: 1, name: 'Bench Press', muscleGroup: 'Chest', difficulty: 'Intermediate', equipment: 'Barbell' },
    { id: 2, name: 'Push-up', muscleGroup: 'Chest', difficulty: 'Beginner', equipment: 'Bodyweight' },
    { id: 3, name: 'Dumbbell Flyes', muscleGroup: 'Chest', difficulty: 'Intermediate', equipment: 'Dumbbell' },
    { id: 4, name: 'Pull-up', muscleGroup: 'Back', difficulty: 'Advanced', equipment: 'Bodyweight' },
    { id: 5, name: 'Deadlift', muscleGroup: 'Back', difficulty: 'Advanced', equipment: 'Barbell' },
    { id: 6, name: 'Dumbbell Row', muscleGroup: 'Back', difficulty: 'Beginner', equipment: 'Dumbbell' },
    { id: 7, name: 'Lat Pulldown', muscleGroup: 'Back', difficulty: 'Intermediate', equipment: 'Machine' },
    { id: 8, name: 'Squat', muscleGroup: 'Legs', difficulty: 'Intermediate', equipment: 'Barbell' },
    { id: 9, name: 'Lunge', muscleGroup: 'Legs', difficulty: 'Beginner', equipment: 'Bodyweight' },
    { id: 10, name: 'Leg Press', muscleGroup: 'Legs', difficulty: 'Intermediate', equipment: 'Machine' },
    { id: 11, name: 'Overhead Press', muscleGroup: 'Shoulders', difficulty: 'Intermediate', equipment: 'Barbell' },
    { id: 12, name: 'Lateral Raises', muscleGroup: 'Shoulders', difficulty: 'Beginner', equipment: 'Dumbbell' },
    { id: 13, name: 'Bicep Curl', muscleGroup: 'Arms', difficulty: 'Beginner', equipment: 'Dumbbell' },
    { id: 14, name: 'Tricep Dips', muscleGroup: 'Arms', difficulty: 'Intermediate', equipment: 'Bodyweight' },
    { id: 15, name: 'Plank', muscleGroup: 'Core', difficulty: 'Beginner', equipment: 'Bodyweight' },
    { id: 16, name: 'Crunches', muscleGroup: 'Core', difficulty: 'Beginner', equipment: 'Bodyweight' },
    { id: 17, name: 'Kettlebell Swing', muscleGroup: 'Legs', difficulty: 'Intermediate', equipment: 'Kettlebell' },
    { id: 18, name: 'Skull Crushers', muscleGroup: 'Arms', difficulty: 'Intermediate', equipment: 'Barbell' },
];

const App = () => {
    // App State
    const [workouts, setWorkouts] = useState<WorkoutsState>({});
    const [isAppLoading, setIsAppLoading] = useState(true);
    const [activeView, setActiveView] = useState('tracker'); // 'tracker', 'coach', 'search', 'analytics', 'library'
    const [theme, setTheme] = useState(() => {
        const savedTheme = localStorage.getItem('mygymtracky-theme');
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        return savedTheme || (prefersDark ? 'dark' : 'light');
    });

    // Form State
    const [day, setDay] = useState('Monday');
    const [workoutFocus, setWorkoutFocus] = useState('');
    const [exercise, setExercise] = useState('');
    const [sets, setSets] = useState('');
    const [reps, setReps] = useState('');
    const [weight, setWeight] = useState('');
    const [duration, setDuration] = useState('');
    const [intensity, setIntensity] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
    const [editingDay, setEditingDay] = useState<string | null>(null);
    const [justCompletedId, setJustCompletedId] = useState<number | null>(null);
    
    // AI Suggestions State
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    
    // AI Chat State
    const [chatSession, setChatSession] = useState<Chat | null>(null);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

    // AI Web Search State
    const [webSearchInput, setWebSearchInput] = useState('');
    const [webSearchResult, setWebSearchResult] = useState<{ text: string; sources: any[] } | null>(null);
    const [isWebSearchLoading, setIsWebSearchLoading] = useState(false);

    // AI Form Feedback State
    const [feedbackState, setFeedbackState] = useState<{
        isOpen: boolean;
        workout: Workout | null;
        userImage: string | null; // base64 data URL
        feedback: string | null;
        isLoading: boolean;
    }>({
        isOpen: false,
        workout: null,
        userImage: null,
        feedback: null,
        isLoading: false,
    });
    
    // Exercise Library State
    const [muscleFilter, setMuscleFilter] = useState('All');
    const [difficultyFilter, setDifficultyFilter] = useState('All');
    const [equipmentFilter, setEquipmentFilter] = useState('All');


    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Effect for the initial loading screen
    useEffect(() => {
        const timer = setTimeout(() => setIsAppLoading(false), 2500); // Show for 2.5 seconds
        return () => clearTimeout(timer);
    }, []);

    // Effect to apply the theme class to the body
    useEffect(() => {
        document.body.className = theme;
    }, [theme]);

    // Effect to initialize the AI chat session
    useEffect(() => {
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            config: {
                systemInstruction: 'You are MygymTracky, a friendly and motivational AI fitness coach. Help users with their workout plans, nutrition advice, and fitness questions. Keep your answers concise, encouraging, and easy to understand.',
            },
        });
        setChatSession(chat);
    }, [ai.chats]);


    // Effect to scroll to the bottom of the chat messages
    useEffect(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chatMessages]);

    // Effect to update the focus input when the day changes and not in edit mode
    useEffect(() => {
        if (!editingWorkout) {
            if (workouts[day]) {
                setWorkoutFocus(workouts[day].focus);
            } else {
                setWorkoutFocus('');
            }
        }
    }, [day, workouts, editingWorkout]);
    
    const toggleTheme = () => {
        setTheme(prevTheme => {
            const newTheme = prevTheme === 'light' ? 'dark' : 'light';
            localStorage.setItem('mygymtracky-theme', newTheme);
            return newTheme;
        });
    };

    const fetchWorkoutImage = useCallback(async (exerciseName: string): Promise<string> => {
        // Sanitize the exercise name for the URL and use a reliable image placeholder service
        const query = encodeURIComponent(exerciseName.toLowerCase().replace(/\s+/g, ','));
        // Use a more reliable image service like Unsplash Source
        return `https://source.unsplash.com/200x200/?${query},gym,fitness,workout`;
    }, []);

    const getWorkoutSuggestions = useCallback(async () => {
        if (!workoutFocus) {
            alert('Please enter a Workout Focus first to get suggestions.');
            return;
        }
        setIsSuggesting(true);
        setSuggestions([]); // Clear old suggestions

        try {
            const prompt = `Suggest 5 popular and effective exercises for a "${workoutFocus}" workout. Provide the response as a simple JSON array of strings.`;
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.STRING,
                        },
                    },
                },
            });
            
            const jsonStr = response.text.trim();
            const suggestedExercises = JSON.parse(jsonStr);
            setSuggestions(suggestedExercises);

        } catch (error) {
            console.error("Error fetching suggestions:", error);
            alert("Sorry, I couldn't get any suggestions right now. Please try again.");
        } finally {
            setIsSuggesting(false);
        }

    }, [ai.models, workoutFocus]);

    const handleSuggestionClick = (suggestion: string) => {
        setExercise(suggestion);
        setSuggestions([]); // Hide suggestions after one is selected
    };

    const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!exercise || !sets || !reps || !weight || !workoutFocus || !duration || !intensity) {
            alert('Please fill out all fields.');
            return;
        }
        
        if (editingWorkout && editingDay) {
            // Update existing workout
            setWorkouts(prevWorkouts => {
                const dayData = prevWorkouts[editingDay];
                if (!dayData) return prevWorkouts;

                const updatedExercises = dayData.exercises.map(workout =>
                    workout.id === editingWorkout.id
                        ? {
                            ...workout,
                            name: exercise,
                            sets: parseInt(sets, 10),
                            reps: parseInt(reps, 10),
                            weight: weight,
                            duration: duration,
                            intensity: intensity,
                          }
                        : workout
                );

                return {
                    ...prevWorkouts,
                    [editingDay]: {
                        ...dayData,
                        exercises: updatedExercises
                    }
                };
            });
            cancelEditing();
        } else {
            // Add new workout
            setIsLoading(true);

            const newWorkout: Workout = {
                id: Date.now(),
                name: exercise,
                sets: parseInt(sets, 10),
                reps: parseInt(reps, 10),
                weight: weight,
                completed: false,
                mediaUrl: null,
                duration: duration,
                intensity: intensity,
            };

            setWorkouts(prevWorkouts => {
                const dayData = prevWorkouts[day];
                if (dayData) {
                    return {
                        ...prevWorkouts,
                        [day]: { ...dayData, exercises: [...dayData.exercises, newWorkout] }
                    };
                }
                return {
                    ...prevWorkouts,
                    [day]: { focus: workoutFocus, exercises: [newWorkout] }
                };
            });
            
            const exerciseNameForMedia = exercise;
            setExercise('');
            setSets('');
            setReps('');
            setWeight('');
            setDuration('');
            setIntensity('');
            
            const mediaUrl = await fetchWorkoutImage(exerciseNameForMedia);
            
            setWorkouts(prevWorkouts => {
                const dayData = prevWorkouts[day];
                if (!dayData) {
                    return prevWorkouts;
                }
                return {
                    ...prevWorkouts,
                    [day]: {
                        ...dayData,
                        exercises: dayData.exercises.map(workout =>
                            workout.id === newWorkout.id ? { ...workout, mediaUrl } : workout
                        )
                    }
                };
            });
            
            setIsLoading(false);
        }
    };

    const handleSendMessage = async (e?: React.FormEvent, suggestedPrompt?: string) => {
        if (e) e.preventDefault();
        const messageText = suggestedPrompt || chatInput;
        if (!messageText.trim() || !chatSession) return;

        const userMessage: ChatMessage = { role: 'user', text: messageText };
        setChatMessages(prev => [...prev, userMessage]);
        setChatInput('');
        setIsChatLoading(true);

        try {
            const response = await chatSession.sendMessage({ message: messageText });
            const modelMessage: ChatMessage = { role: 'model', text: response.text };
            setChatMessages(prev => [...prev, modelMessage]);
        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: ChatMessage = { role: 'model', text: "Sorry, I'm having trouble connecting. Please try again." };
            setChatMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleWebSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!webSearchInput.trim()) return;

        setIsWebSearchLoading(true);
        setWebSearchResult(null);

        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: webSearchInput,
                config: {
                    tools: [{ googleSearch: {} }],
                },
            });

            const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            
            setWebSearchResult({
                text: response.text,
                sources: sources,
            });

        } catch (error) {
            console.error("Error during web search:", error);
            setWebSearchResult({
                text: "Sorry, I couldn't perform the search. Please try again.",
                sources: [],
            });
        } finally {
            setIsWebSearchLoading(false);
        }
    };

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFeedbackState(prev => ({ ...prev, userImage: reader.result as string }));
            };
            reader.readAsDataURL(file);
        }
    };

    const getAIFormFeedback = async () => {
        if (!feedbackState.userImage || !feedbackState.workout) return;

        setFeedbackState(prev => ({...prev, isLoading: true, feedback: null}));
        try {
            const prompt = `As an expert fitness coach, analyze the user's form for the "${feedbackState.workout.name}" exercise in this image. Provide specific, constructive feedback on their posture, alignment, and execution. Point out any potential mistakes and suggest 2-3 actionable corrections to ensure safety and effectiveness. Format the feedback in a short, easy-to-read list. Start with an encouraging sentence.`;
            const imagePart = {
                inlineData: {
                    data: feedbackState.userImage.split(',')[1],
                    mimeType: 'image/jpeg' 
                }
            };
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: { parts: [ {text: prompt}, imagePart ] },
            });

            setFeedbackState(prev => ({...prev, feedback: response.text}));

        } catch (error) {
            console.error("Error getting AI form feedback:", error);
            setFeedbackState(prev => ({...prev, feedback: "Sorry, I couldn't analyze the image right now. Please try again."}));
        } finally {
            setFeedbackState(prev => ({...prev, isLoading: false}));
        }
    };

    const openFeedbackModal = (workout: Workout) => {
        setFeedbackState({
            isOpen: true,
            workout: workout,
            userImage: null,
            feedback: null,
            isLoading: false,
        });
    };

    const closeFeedbackModal = () => {
        setFeedbackState({ isOpen: false, workout: null, userImage: null, feedback: null, isLoading: false });
    };

    const startEditing = (day: string, workout: Workout) => {
        setEditingWorkout(workout);
        setEditingDay(day);
        setDay(day);
        setWorkoutFocus(workouts[day].focus);
        setExercise(workout.name);
        setSets(String(workout.sets));
        setReps(String(workout.reps));
        setWeight(workout.weight);
        setDuration(workout.duration);
        setIntensity(workout.intensity);
    };

    const cancelEditing = () => {
        setEditingWorkout(null);
        setEditingDay(null);
        setExercise('');
        setSets('');
        setReps('');
        setWeight('');
        setDuration('');
        setIntensity('');
        if (workouts[day]) {
            setWorkoutFocus(workouts[day].focus);
        } else {
            setWorkoutFocus('');
        }
    };

    const toggleComplete = (day: string, id: number) => {
        let isCompleting = false;
        setWorkouts(prevWorkouts => {
            const dayData = prevWorkouts[day];
            if (!dayData) return prevWorkouts;
            
            const newExercises = dayData.exercises.map(workout => {
                if (workout.id === id) {
                    if (!workout.completed) {
                        isCompleting = true;
                    }
                    return { ...workout, completed: !workout.completed };
                }
                return workout;
            });

            return {
                ...prevWorkouts,
                [day]: {
                    ...dayData,
                    exercises: newExercises
                }
            };
        });

        if (isCompleting) {
            setJustCompletedId(id);
            setTimeout(() => {
                setJustCompletedId(null);
            }, 1200); // Duration of the animation
        }
    };

    const clearRoutine = () => {
        setWorkouts({});
    };

    // --- Data Calculation for Analytics & Progress ---
    const allWorkouts = Object.values(workouts).flatMap((dayData: DayWorkout) => dayData.exercises);
    const completedWorkoutsList = allWorkouts.filter(w => w.completed);
    const completedWorkouts = completedWorkoutsList.length;
    const totalWorkouts = allWorkouts.length;
    const progressPercentage = totalWorkouts > 0 ? (completedWorkouts / totalWorkouts) * 100 : 0;
    
    // Analytics specific calculations
    const totalSets = completedWorkoutsList.reduce((sum, workout) => sum + workout.sets, 0);
    const totalReps = completedWorkoutsList.reduce((sum, workout) => sum + workout.reps, 0);

    const focusCounts = Object.values(workouts).reduce((acc, dayData: DayWorkout) => {
        acc[dayData.focus] = (acc[dayData.focus] || 0) + dayData.exercises.length;
        return acc;
    }, {} as Record<string, number>);

    const mostFrequentFocus = Object.keys(focusCounts).reduce((a, b) => focusCounts[a] > focusCounts[b] ? a : b, 'None');
    
    const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
    const dailyDistribution = weekDays.map(day => ({
        day,
        count: workouts[day] ? workouts[day].exercises.length : 0,
    }));
    const maxDailyCount = Math.max(...dailyDistribution.map(d => d.count), 1);

    const focusBreakdown = Object.entries(focusCounts).map(([focus, count]) => ({ focus, count }));
    const maxFocusCount = Math.max(...focusBreakdown.map(f => f.count), 1);
    
    const hasWorkouts = Object.keys(workouts).length > 0;
    
    // --- Data Calculation for Exercise Library ---
    const muscleGroups = ['All', ...Array.from(new Set(EXERCISE_LIBRARY_DATA.map(e => e.muscleGroup)))];
    const difficulties = ['All', ...Array.from(new Set(EXERCISE_LIBRARY_DATA.map(e => e.difficulty)))];
    const equipments = ['All', ...Array.from(new Set(EXERCISE_LIBRARY_DATA.map(e => e.equipment)))];

    const filteredExercises = EXERCISE_LIBRARY_DATA.filter(exercise => {
        const muscleMatch = muscleFilter === 'All' || exercise.muscleGroup === muscleFilter;
        const difficultyMatch = difficultyFilter === 'All' || exercise.difficulty === difficultyFilter;
        const equipmentMatch = equipmentFilter === 'All' || exercise.equipment === equipmentFilter;
        return muscleMatch && difficultyMatch && equipmentMatch;
    });

    if (isAppLoading) {
        return (
            <div className="loading-screen">
                <h1>Hey buddy lite weight</h1>
            </div>
        );
    }

    return (
        <div className="app-layout">
            <nav className="sidebar">
                <div className="sidebar-main">
                    <div className="sidebar-item" onClick={() => setActiveView('tracker')}>
                        <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path><path d="M13 7h-2v6h6v-2h-4V7z"></path></svg>
                        <span className="tooltip-text">Workout History</span>
                    </div>
                     <div className="sidebar-item" onClick={() => setActiveView('coach')}>
                        <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"></path><path d="M14.5 10.5c0-.828-.672-1.5-1.5-1.5s-1.5.672-1.5 1.5.672 1.5 1.5 1.5 1.5-.672 1.5-1.5zm-5 0c0-.828-.672-1.5-1.5-1.5s-1.5.672-1.5 1.5.672 1.5 1.5 1.5 1.5-.672 1.5-1.5zm6 4H8.5c-1.01 0-1.911.455-2.561 1.223A5.955 5.955 0 0 1 12 15a5.955 5.955 0 0 1 6.061 2.723C17.411 16.955 16.51 16.5 15.5 16.5z"></path></svg>
                        <span className="tooltip-text">AI Coach</span>
                    </div>
                    <div className="sidebar-item" onClick={() => setActiveView('search')}>
                        <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
                        <span className="tooltip-text">Web Search</span>
                    </div>
                     <div className="sidebar-item" onClick={() => setActiveView('analytics')}>
                       <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 21h17v-2H5V4H3v17c0 1.103.897 2 2 2zM19 1H8c-1.103 0-2 .897-2 2v11c0 1.103.897 2 2 2h11c1.103 0 2-.897 2-2V3c0-1.103-.897-2-2-2zm-1 12H9V4h9v9z"></path><path d="M10 6h2v6h-2zm3 2h2v4h-2z"></path></svg>
                        <span className="tooltip-text">Analytics</span>
                    </div>
                     <div className="sidebar-item" onClick={() => setActiveView('library')}>
                        <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 5c-1.654 0-3 1.346-3 3v13H5V6c0-1.654-1.346-3-3-3H1V2h1v2c1.103 0 2 .897 2 2v13h12V8c0-1.103.897-2 2-2h1V5h-1zm-2-2h-1V2h1v1z"></path></svg>
                        <span className="tooltip-text">Exercise Library</span>
                    </div>
                </div>
                <div className="sidebar-footer">
                     <div className="sidebar-item" onClick={toggleTheme}>
                        {theme === 'light' ? (
                            <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M10 2c-1.82 0-3.53.5-5 1.35 2.99 1.73 5 4.95 5 8.65s-2.01 6.92-5 8.65C6.47 21.5 8.18 22 10 22c5.52 0 10-4.48 10-10S15.52 2 10 2z"></path></svg>
                        ) : (
                            <svg className="sidebar-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"></path></svg>
                        )}
                        <span className="tooltip-text">Toggle Theme</span>
                    </div>
                </div>
            </nav>
            <main className="main-content">
                {activeView === 'tracker' ? (
                    <>
                        <h1>Gym Routine Tracker</h1>
                        <p className="app-description">Plan your weekly workouts by muscle group and track your progress.</p>
                        
                        <form onSubmit={handleFormSubmit} className="workout-form" aria-labelledby="form-heading">
                             <div className="form-group">
                                <label htmlFor="day">Day</label>
                                <select id="day" className="form-control" value={day} onChange={(e) => setDay(e.target.value)} disabled={!!editingWorkout}>
                                    <option value="Monday">Monday</option>
                                    <option value="Tuesday">Tuesday</option>
                                    <option value="Wednesday">Wednesday</option>
                                    <option value="Thursday">Thursday</option>
                                    <option value="Friday">Friday</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label htmlFor="workout-focus">Workout Focus</label>
                                <input id="workout-focus" type="text" className="form-control" value={workoutFocus} onChange={(e) => setWorkoutFocus(e.target.value)} placeholder="e.g., Legs" disabled={!!workouts[day] || !!editingWorkout} required/>
                            </div>
                            <div className="form-group">
                                <div className="label-with-button">
                                    <label htmlFor="exercise">Exercise</label>
                                    <button type="button" className="btn btn-suggest" onClick={getWorkoutSuggestions} disabled={!workoutFocus || isSuggesting} aria-label="Get AI exercise suggestions">
                                        {isSuggesting ? 'Thinking...' : 'AI Suggest'}
                                    </button>
                                </div>
                                <input id="exercise" type="text" className="form-control" value={exercise} onChange={(e) => setExercise(e.target.value)} placeholder="e.g., Squats" required/>
                                {suggestions.length > 0 && (
                                    <div className="suggestion-container">
                                        {suggestions.map((suggestion, index) => (
                                            <button key={index} type="button" className="suggestion-btn" onClick={() => handleSuggestionClick(suggestion)}>{suggestion}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div className="form-group"><label htmlFor="sets">Sets</label><input id="sets" type="number" className="form-control" value={sets} onChange={(e) => setSets(e.target.value)} placeholder="e.g., 3" min="1" required/></div>
                            <div className="form-group"><label htmlFor="reps">Reps</label><input id="reps" type="number" className="form-control" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="e.g., 12" min="1" required/></div>
                            <div className="form-group"><label htmlFor="weight">Weight</label><input id="weight" type="text" className="form-control" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="e.g., 50 lbs" required/></div>
                            <div className="form-group"><label htmlFor="duration">Duration</label><input id="duration" type="text" className="form-control" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g., 45 mins" required/></div>
                            <div className="form-group">
                                <label htmlFor="intensity">Intensity</label>
                                <select id="intensity" className="form-control" value={intensity} onChange={(e) => setIntensity(e.target.value)} required>
                                    <option value="">Select Intensity</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
                                </select>
                            </div>
                            <div className="form-actions">
                                <button type="submit" className="btn btn-primary" disabled={isLoading} aria-label={editingWorkout ? 'Update exercise' : 'Add new exercise'}>
                                    {editingWorkout ? 'Update Exercise' : (isLoading ? 'Adding...' : 'Add Exercise')}
                                </button>
                                {editingWorkout && (<button type="button" onClick={cancelEditing} className="btn btn-secondary" aria-label="Cancel editing">Cancel</button>)}
                            </div>
                        </form>

                        {totalWorkouts > 0 && (
                            <div className="progress-section">
                                <h3>Weekly Progress</h3>
                                <div className="progress-container"><div className="progress-bar" style={{ width: `${progressPercentage}%` }}></div></div>
                                <p className="progress-text">{Math.round(progressPercentage)}% Complete</p>
                            </div>
                        )}

                        <div className="weekly-routine">
                            {Object.keys(workouts).map(day => {
                                const dayData = workouts[day];
                                return dayData.exercises.length > 0 && (
                                    <div key={day} className="day-section">
                                        <h2 className="day-heading">{day}</h2>
                                        <h3 className="workout-focus">{dayData.focus}</h3>
                                        <ul className="workout-list">
                                            {dayData.exercises.map(workout => (
                                                <li key={workout.id} className={`workout-item ${workout.completed ? 'completed' : ''}`}>
                                                    {justCompletedId === workout.id && (
                                                        <div className="completion-animation">
                                                            <svg className="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                                                                <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                                                                <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                                                            </svg>
                                                        </div>
                                                    )}
                                                    {workout.mediaUrl ? (
                                                        <img src={workout.mediaUrl} alt={workout.name} className="workout-media" />
                                                    ) : (
                                                        <div className="media-loader"></div>
                                                    )}
                                                    <div className="workout-details">
                                                        <h3>{workout.name}</h3>
                                                        <p>{workout.sets} sets x {workout.reps} reps @ {workout.weight}</p>
                                                        <p className="extra-details">{workout.duration} &bull; {workout.intensity} Intensity</p>
                                                    </div>
                                                    <div className="workout-actions">
                                                        <button onClick={() => toggleComplete(day, workout.id)} className="btn btn-icon btn-success" aria-label={`Mark ${workout.name} as complete`}>✓</button>
                                                        <button onClick={() => startEditing(day, workout)} className="btn btn-icon btn-edit" aria-label={`Edit ${workout.name}`}>✎</button>
                                                        <button onClick={() => openFeedbackModal(workout)} className="btn btn-icon btn-form-check" aria-label={`Check form for ${workout.name}`}>?</button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {hasWorkouts && (<div className="list-controls"><button onClick={clearRoutine} className="btn btn-danger" aria-label="Clear all exercises from routine">Clear Routine</button></div>)}
                    </>
                ) : activeView === 'coach' ? (
                    <div className="chat-container">
                        <div className="chat-header">
                            <h2>AI Fitness Coach</h2>
                            <p>Your personal guide to a better workout.</p>
                        </div>
                        <div className="chat-messages">
                            {chatMessages.map((msg, index) => (
                                <div key={index} className={`message ${msg.role}`}>
                                    <p>{msg.text}</p>
                                </div>
                            ))}
                            {isChatLoading && (
                                <div className="message model">
                                    <div className="thinking-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            )}
                            <div ref={chatMessagesEndRef} />
                        </div>
                         {chatMessages.length === 0 && !isChatLoading && (
                            <div className="suggested-questions">
                                <button onClick={() => handleSendMessage(undefined, "What's a good warm-up for leg day?")}>What's a good warm-up for leg day?</button>
                                <button onClick={() => handleSendMessage(undefined, "Can you suggest a healthy post-workout snack?")}>Suggest a post-workout snack.</button>
                                <button onClick={() => handleSendMessage(undefined, "How can I improve my bench press form?")}>How can I improve my bench press form?</button>
                            </div>
                        )}
                        <form onSubmit={handleSendMessage} className="chat-input-form">
                            <input
                                type="text"
                                className="chat-input"
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                placeholder="Ask your AI coach anything..."
                                aria-label="Chat message input"
                                disabled={isChatLoading}
                            />
                            <button type="submit" className="send-btn" disabled={!chatInput.trim() || isChatLoading} aria-label="Send message">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                            </button>
                        </form>
                    </div>
                ) : activeView === 'search' ? (
                     <div className="web-search-container">
                        <div className="chat-header">
                            <h2>AI Web Search</h2>
                            <p>Get up-to-date answers from the web, powered by Gemini.</p>
                        </div>
                        <form onSubmit={handleWebSearch} className="web-search-form">
                            <input
                                type="text"
                                className="web-search-input"
                                value={webSearchInput}
                                onChange={(e) => setWebSearchInput(e.target.value)}
                                placeholder="Ask anything..."
                                aria-label="Web search input"
                                disabled={isWebSearchLoading}
                            />
                            <button type="submit" className="send-btn" disabled={!webSearchInput.trim() || isWebSearchLoading} aria-label="Perform web search">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path>
                                </svg>
                            </button>
                        </form>

                        {isWebSearchLoading && (
                            <div className="message model" style={{alignSelf: 'center', marginTop: '2rem'}}>
                                <div className="thinking-indicator">
                                    <span></span><span></span><span></span>
                                </div>
                            </div>
                        )}
                        
                        {webSearchResult && (
                            <div className="search-results-container">
                                <p className="search-result-text">{webSearchResult.text}</p>
                                {webSearchResult.sources.length > 0 && (
                                    <div className="sources-container">
                                        <h4>Sources:</h4>
                                        <ul className="source-list">
                                            {webSearchResult.sources.map((source, index) => (
                                                <li key={index} className="source-item">
                                                    <a href={source.web.uri} target="_blank" rel="noopener noreferrer">
                                                        {source.web.title || source.web.uri}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : activeView === 'analytics' ? (
                     <div className="analytics-container">
                        <div className="chat-header">
                            <h2>Workout Analytics</h2>
                            <p>An overview of your performance and consistency.</p>
                        </div>
                        
                        {totalWorkouts === 0 ? (
                            <div className="no-analytics-message">
                                <p>No workouts logged yet. Add some exercises to see your stats!</p>
                            </div>
                        ) : (
                            <>
                                <div className="stats-grid">
                                    <div className="stat-card">
                                        <h4>Workouts Done</h4>
                                        <p>{completedWorkouts}</p>
                                    </div>
                                    <div className="stat-card">
                                        <h4>Total Sets</h4>
                                        <p>{totalSets}</p>
                                    </div>
                                    <div className="stat-card">
                                        <h4>Total Reps</h4>
                                        <p>{totalReps}</p>
                                    </div>
                                    <div className="stat-card">
                                        <h4>Top Focus</h4>
                                        <p>{mostFrequentFocus}</p>
                                    </div>
                                </div>

                                <div className="chart-container">
                                    <h3>Weekly Distribution</h3>
                                    <div className="bar-chart">
                                        {dailyDistribution.map(({ day, count }) => (
                                            <div className="bar-item" key={day}>
                                                <div className="bar" style={{ height: `${(count / maxDailyCount) * 100}%` }}>
                                                    <span className="bar-value">{count}</span>
                                                </div>
                                                <span className="bar-label">{day.substring(0, 3)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="chart-container">
                                    <h3>Focus Area Breakdown</h3>
                                    <div className="focus-breakdown-chart">
                                        {focusBreakdown.map(({ focus, count }) => (
                                             <div className="focus-bar-item" key={focus}>
                                                 <span className="focus-bar-label">{focus}</span>
                                                 <div className="focus-bar-track">
                                                     <div className="focus-bar" style={{ width: `${(count / maxFocusCount) * 100}%` }}>
                                                         <span>{count}</span>
                                                     </div>
                                                 </div>
                                             </div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ) : activeView === 'library' ? (
                    <div className="library-container">
                         <div className="chat-header">
                            <h2>Exercise Library</h2>
                            <p>Discover new exercises to add to your routine.</p>
                        </div>
                        <div className="library-filters">
                             <div className="filter-group">
                                <label htmlFor="muscle-filter">Muscle Group</label>
                                <select id="muscle-filter" className="form-control" value={muscleFilter} onChange={(e) => setMuscleFilter(e.target.value)}>
                                    {muscleGroups.map(group => <option key={group} value={group}>{group}</option>)}
                                </select>
                            </div>
                            <div className="filter-group">
                                <label htmlFor="difficulty-filter">Difficulty</label>
                                <select id="difficulty-filter" className="form-control" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
                                    {difficulties.map(level => <option key={level} value={level}>{level}</option>)}
                                </select>
                            </div>
                             <div className="filter-group">
                                <label htmlFor="equipment-filter">Equipment</label>
                                <select id="equipment-filter" className="form-control" value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)}>
                                    {equipments.map(item => <option key={item} value={item}>{item}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="exercise-grid">
                            {filteredExercises.length > 0 ? (
                                filteredExercises.map(ex => (
                                    <div key={ex.id} className="exercise-card">
                                        <h3>{ex.name}</h3>
                                        <div className="exercise-tags">
                                            <span className={`tag tag-muscle-${ex.muscleGroup.toLowerCase()}`}>{ex.muscleGroup}</span>
                                            <span className={`tag tag-difficulty-${ex.difficulty.toLowerCase()}`}>{ex.difficulty}</span>
                                            <span className={`tag tag-equipment`}>{ex.equipment}</span>
                                        </div>
                                        <button className="btn-add-workout" disabled>Add to Workout</button>
                                    </div>
                                ))
                            ) : (
                                <p className="no-exercises-message">No exercises match your criteria.</p>
                            )}
                        </div>
                    </div>
                ) : null}

                {feedbackState.isOpen && (
                    <div className="feedback-modal-overlay" onClick={closeFeedbackModal}>
                        <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
                            <div className="feedback-modal-header">
                               <h3>Form Feedback for: {feedbackState.workout?.name}</h3>
                               <button onClick={closeFeedbackModal} className="close-btn" aria-label="Close form feedback modal">&times;</button>
                            </div>
                            <div className="feedback-modal-content">
                                {!feedbackState.feedback && (
                                    <>
                                        <p>Upload a photo of your form for AI analysis.</p>
                                        <input 
                                            type="file" 
                                            id="imageUpload" 
                                            accept="image/*" 
                                            onChange={handleImageUpload} 
                                            style={{ display: 'none' }}
                                        />
                                        <label htmlFor="imageUpload" className="btn btn-secondary upload-label">
                                            {feedbackState.userImage ? 'Change Photo' : 'Choose Photo'}
                                        </label>
                                        
                                        {feedbackState.userImage && (
                                            <div className="image-preview-container">
                                                <img src={feedbackState.userImage} alt="User form preview" className="image-preview"/>
                                            </div>
                                        )}

                                        <button 
                                            onClick={getAIFormFeedback} 
                                            className="btn btn-primary" 
                                            disabled={!feedbackState.userImage || feedbackState.isLoading}
                                        >
                                            {feedbackState.isLoading ? 'Analyzing...' : 'Get Feedback'}
                                        </button>
                                    </>
                                )}

                                {feedbackState.isLoading && !feedbackState.feedback && (
                                    <div className="message model" style={{alignSelf: 'center', marginTop: '1rem'}}>
                                        <div className="thinking-indicator">
                                            <span></span><span></span><span></span>
                                        </div>
                                    </div>
                                )}

                                {feedbackState.feedback && (
                                    <div className="feedback-response">
                                        <h4>AI Coach Feedback:</h4>
                                        <p>{feedbackState.feedback}</p>
                                        <button onClick={closeFeedbackModal} className="btn btn-primary">Got it!</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);