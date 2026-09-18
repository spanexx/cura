import React, { useState, useEffect, useRef } from 'react';
import { 
  Clock, 
  MessageSquare, 
  Search, 
  AlertTriangle, 
  CheckCircle, 
  User, 
  Plane, 
  Luggage, 
  BookOpen, 
  ShieldAlert, 
  Award, 
  Send, 
  PauseCircle, 
  Play, 
  RotateCcw, 
  Zap, 
  HelpCircle, 
  FileText, 
  Activity, 
  Smile, 
  Frown, 
  Meh, 
  ChevronRight, 
  Info,
  TrendingUp,
  TrendingDown,
  Gauge,
  Sparkles,
  History,
  Check,
  Settings,
  Sliders,
  Globe,
  Key,
  Server,
  Plus,
  Sun,
  Moon
} from 'lucide-react';

import { callLlm, cleanAndParseJson, normalizeBaseUrl } from './llm';
import { generateAirlineCase, AIRLINE_CATEGORY_NAMES } from './airlineCases';
import { DEFAULT_LLM_SETTINGS, clearLlmSettings, loadLlmSettings, saveLlmSettings } from './settings';
import { loadSessionHistory, appendSession, saveSessionHistory, clearSessionHistory, sanitizeSession } from './history';
import { loadTheme, saveTheme, applyTheme, nextTheme } from './theme';

// Tiny local random picker for offline practice replies.
const rand2 = {
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)]
};

// Small stat tile for the home-screen KPI dashboard.
const KpiTile = ({ label, value, icon }) => (
  <div className="rounded-xl bg-surface-2/60 border border-line/70 px-3 py-2.5 transition hover:border-line-strong">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-3 mb-1">{icon}{label}</div>
    <div className="text-lg font-black text-ink leading-none">{value}</div>
  </div>
);

const RYANAIR_SOP = [
  {
    category: 'Baggage',
    title: 'Cabin Bag Policy',
    content: 'All fare types include 1 small personal bag (40x20x25cm) fitting under seat. Regular & Flexi Plus includes 10kg overhead bag (55x40x20cm). Excess bag at gate costs €46-€70.'
  },
  {
    category: 'Baggage',
    title: 'Checked Baggage Fees',
    content: '10kg or 20kg checked bags available. Oversized or overweight bags charged €12 per extra kg at airport.'
  },
  {
    category: 'Bookings & Changes',
    title: '24-Hour Grace Period & Minor Corrections',
    content: 'Minor spelling corrections (up to 3 characters per name) are free within 24 hours of booking. Flight dates/times changed within 24 hours incur fare difference only.'
  },
  {
    category: 'Bookings & Changes',
    title: 'Name Change Policy',
    content: 'Standard name changes cost €115 online or €160 via phone/airport per passenger per flight.'
  },
  {
    category: 'Bookings & Changes',
    title: 'Self-Service & App-First Policy',
    content: 'Passengers MUST perform eligible changes (like minor name spelling corrections up to 3 chars within 24h) directly via Ryanair App or Web. Agents must push self-service first. Manual agent override requires customer proof/screenshot of app/web technical error.'
  },
  {
    category: 'Check-In & Fees',
    title: 'Online Check-in Rules',
    content: 'Online check-in opens 24h before departure (60 days if seat purchased). Airport check-in fee is €55/£55 per passenger if not checked in online.'
  },
  {
    category: 'Disruptions',
    title: 'EU261 Rights & Delays',
    content: 'Delays > 2 hours: Right to care (vouchers for food/drink). Delays > 3 hours: Cash compensation (€250-€600 depending on distance) UNLESS caused by extraordinary circumstances (weather, ATC).'
  }
];

// Pre-saved cases removed: every case now comes from the AI generator, the
// offline generator in ./airlineCases.js, or the custom-case builder.


// Read once at startup; validated inside ./settings.js so bad data cannot break state.
const SAVED_LLM_SETTINGS = loadLlmSettings();

export default function App() {
  const [appState, setAppState] = useState('setup'); // 'setup' | 'simulating' | 'scorecard'
  const [isPracticeMode, setIsPracticeMode] = useState(false); // practice sessions run fully offline
  const [scenarios, setScenarios] = useState([]); // cases arrive from the AI generator or the custom builder
  const [selectedScenario, setSelectedScenario] = useState(null);

  // Titles of recently generated cases so quick repeat clicks do not repeat a story.
  const [recentTitles, setRecentTitles] = useState([]);

  // Theme: dark by default, switchable to light (see ./theme.js).
  const [theme, setTheme] = useState(loadTheme);

  // Persistent KPI history shown on the home-screen dashboard.
  const [sessionHistory, setSessionHistory] = useState(loadSessionHistory);
  const [showHistoryList, setShowHistoryList] = useState(false);

  // On screens too narrow for three columns, the workspace shows one pane at a time.
  const [activePane, setActivePane] = useState('chat'); // 'case' | 'chat' | 'policy'
  
  // Custom LLM Configuration (restored from the browser on load - see ./settings.js)
  const [provider, setProvider] = useState(SAVED_LLM_SETTINGS.provider); // 'gemini' | 'openai_compatible'
  const [baseUrl, setBaseUrl] = useState(SAVED_LLM_SETTINGS.baseUrl);
  const [apiKey, setApiKey] = useState(SAVED_LLM_SETTINGS.apiKey);
  const [modelId, setModelId] = useState(SAVED_LLM_SETTINGS.modelId);
  const [temperature, setTemperature] = useState(SAVED_LLM_SETTINGS.temperature);
  const [topP, setTopP] = useState(SAVED_LLM_SETTINGS.topP);
  const [maxTokens, setMaxTokens] = useState(SAVED_LLM_SETTINGS.maxTokens);

  const [isGeneratingScenario, setIsGeneratingScenario] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Custom Scenario Builder Form State
  const [customTitle, setCustomTitle] = useState('');
  const [customPassenger, setCustomPassenger] = useState('');
  const [customPnr, setCustomPnr] = useState('');
  const [customFlight, setCustomFlight] = useState('');
  const [customDetails, setCustomDetails] = useState('');
  const [customDifficulty, setCustomDifficulty] = useState('Medium');

  // Simulation Chat State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  
  // Real-time Timers
  const [totalSeconds, setTotalSeconds] = useState(15 * 60); // 15-minute resolution SLA
  const [responseSeconds, setResponseSeconds] = useState(120); // 2-minute response window
  const [isOnHold, setIsOnHold] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Interconnected Performance Metrics
  const [wordCount, setWordCount] = useState(0);
  const [responseViolations, setResponseViolations] = useState(0);
  const [holdCount, setHoldCount] = useState(0);
  const [customerSentiment, setCustomerSentiment] = useState('Neutral'); // 'Angry' | 'Anxious' | 'Neutral' | 'Satisfied'
  const [customerPatience, setCustomerPatience] = useState(100); // 0 to 100%
  const [liveScore, setLiveScore] = useState(100); // Overall dynamic score
  const [liveWpm, setLiveWpm] = useState(0);
  const [eventLog, setEventLog] = useState([]); // Stream of live score updates

  // SOP Wiki Search Filter
  const [sopSearch, setSopSearch] = useState('');
  
  // Evaluation Result
  const [scorecard, setScorecard] = useState(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [llmTest, setLlmTest] = useState(null); // { state: 'testing' | 'ok' | 'warn' | 'error', message }

  const chatContainerRef = useRef(null);
  const practiceTimerRef = useRef(null); // pending offline "customer typing" timeout
  const practicePushbacksRef = useRef(0); // self-service pushback counter for practice replies

  const addEventLog = (type, delta, label) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEventLog((prev) => [{ id: Date.now() + Math.random(), type, delta, label, timestamp }, ...prev]);
    
    if (delta !== 0) {
      setLiveScore((prevScore) => {
        const next = Math.max(0, Math.min(100, prevScore + delta));
        return next;
      });
    }
  };

  const callLlmApi = async ({ systemPrompt, chatHistory = [], jsonSchema = null, overrideMaxTokens = null }) => {
    setApiError(null);

    return callLlm({
      provider,
      baseUrl,
      apiKey,
      modelId,
      systemPrompt,
      chatHistory,
      jsonSchema,
      temperature,
      topP,
      maxTokens,
      overrideMaxTokens
    });
  };

  const handleTestLlmConnection = async () => {
    const modelLabel =
      modelId.trim() || (provider === 'openai_compatible' ? 'gpt-4o-mini' : 'gemini-3-flash-preview');

    if (provider === 'openai_compatible' && !baseUrl.trim()) {
      setLlmTest({ state: 'error', message: 'Set a Base URL first, e.g. https://api.openai.com/v1' });
      return;
    }
    if (provider === 'gemini' && !apiKey.trim()) {
      setLlmTest({ state: 'error', message: 'Add your Gemini API key first.' });
      return;
    }

    setLlmTest({ state: 'testing', message: `Contacting ${modelLabel}...` });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const startedAt = performance.now();

    try {
      const reply = await callLlm({
        provider,
        baseUrl,
        apiKey,
        modelId,
        systemPrompt: 'You are a connectivity probe. Reply with the single word OK.',
        chatHistory: [],
        jsonSchema: null,
        temperature,
        topP,
        maxTokens,
        overrideMaxTokens: 16,
        signal: controller.signal
      });

      const latency = Math.round(performance.now() - startedAt);
      const text = (reply || '').trim();

      if (text) {
        setLlmTest({
          state: 'ok',
          message: `Connected - ${modelLabel} - ${latency} ms - replied "${text.slice(0, 40)}"`
        });
      } else {
        setLlmTest({
          state: 'warn',
          message: `Reached ${modelLabel} in ${latency} ms, but the model returned no text.`
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setLlmTest({
          state: 'error',
          message: 'Timed out after 15s - check the Base URL and that the endpoint is reachable.'
        });
      } else if (err instanceof TypeError) {
        const effectiveUrl = normalizeBaseUrl(baseUrl);
        const wasRerouted = effectiveUrl !== baseUrl.trim();
        setLlmTest({
          state: 'error',
          message: `Could not reach ${effectiveUrl || 'the endpoint'} from the browser. ${
            wasRerouted
              ? 'Your local Base URL was routed through the Vite proxy, so the address is fine - '
              : ''
          }check the LLM server is running; if the Base URL points straight at http://localhost:<port>, use "/llm-proxy/v1" (the Vite dev/preview proxy); and make sure the app is opened via http://localhost:4173 or :5173, not as a local file.`
        });
      } else {
        setLlmTest({ state: 'error', message: err.message });
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleResetLlmSettings = () => {
    clearLlmSettings();
    setProvider(DEFAULT_LLM_SETTINGS.provider);
    setBaseUrl(DEFAULT_LLM_SETTINGS.baseUrl);
    setApiKey(DEFAULT_LLM_SETTINGS.apiKey);
    setModelId(DEFAULT_LLM_SETTINGS.modelId);
    setTemperature(DEFAULT_LLM_SETTINGS.temperature);
    setTopP(DEFAULT_LLM_SETTINGS.topP);
    setMaxTokens(DEFAULT_LLM_SETTINGS.maxTokens);
    setLlmTest(null);
  };

  const handleGenerateAiScenario = async () => {
    setIsGeneratingScenario(true);
    setApiError(null);

    const prompt = `Generate a realistic customer service ticket scenario for a passenger on a Ryanair flight. 
Choose ONE realistic Ryanair customer issue for a fresh simulation. Pick a category at random:
${AIRLINE_CATEGORY_NAMES.join('\n')}

Rules:
- Invent a complete story in that category with concrete dates, times, amounts and what went wrong.
- Vary what the customer wants (refund, fix, explanation, compensation) and their mood (calm, anxious, angry, unreasonable).
- PNR: 6 characters from A-Z/2-9, never 0, O, 1 or I. Flight: FR + 3-4 digits with a plausible Ryanair route, e.g. FR2216 (DUB -> AGP).
- Passenger: a plausible European full name.
- promptScenario: instructions for the AI to role-play this passenger, including how they behave, what they demand, and what makes them calm down.

IMPORTANT: Return ONLY a valid JSON object matching this schema. Do not add markdown framing or text outside JSON.

{
  "title": "Short descriptive scenario title",
  "difficulty": "Easy" | "Medium" | "Hard",
  "passenger": "Full passenger name",
  "pnr": "6-character alphanumeric booking ref e.g. RY882A",
  "flight": "Flight number e.g. FR4021 (STN -> AGP)",
  "details": "Summary of the issue for the agent brief",
  "promptScenario": "Detailed prompt instructing the AI how to act as this passenger during the chat"
}`;

    const jsonSchema = {
      type: "OBJECT",
      properties: {
        title: { type: "STRING" },
        difficulty: { type: "STRING" },
        passenger: { type: "STRING" },
        pnr: { type: "STRING" },
        flight: { type: "STRING" },
        details: { type: "STRING" },
        promptScenario: { type: "STRING" }
      },
      propertyOrdering: ["title", "difficulty", "passenger", "pnr", "flight", "details", "promptScenario"]
    };

    try {
      const resultText = await callLlmApi({ 
        systemPrompt: prompt, 
        chatHistory: [], 
        jsonSchema,
        overrideMaxTokens: 2048
      });

      const generatedScen = cleanAndParseJson(resultText) || {};
      const offlineCase = generateAirlineCase({ avoidTitles: recentTitles });
      const newScenario = {
        id: `ai_${Date.now()}`,
        title: generatedScen.title || offlineCase.title,
        difficulty: ['Easy', 'Medium', 'Hard'].includes(generatedScen.difficulty) ? generatedScen.difficulty : offlineCase.difficulty,
        passenger: generatedScen.passenger || offlineCase.passenger,
        pnr: generatedScen.pnr || offlineCase.pnr,
        flight: generatedScen.flight || offlineCase.flight,
        details: generatedScen.details || offlineCase.details,
        promptScenario: generatedScen.promptScenario || offlineCase.promptScenario,
        category: offlineCase.category
      };
      setScenarios((prev) => [newScenario, ...prev]);
      setSelectedScenario(newScenario);
      setRecentTitles((prev) => [newScenario.title, ...prev].slice(0, 5));
    } catch (err) {
      console.error('Failed to generate AI scenario:', err);

      // Offline fallback: same realistic-case generator, so a failed API call
      // still yields a fresh, varied Ryanair case instead of a canned one.
      const fallbackScenario = generateAirlineCase({ avoidCategories: [], avoidTitles: recentTitles });
      fallbackScenario.id = `fallback_${Date.now()}`;
      setScenarios((prev) => [fallbackScenario, ...prev]);
      setSelectedScenario(fallbackScenario);
      setRecentTitles((prev) => [fallbackScenario.title, ...prev].slice(0, 5));
      setApiError(`Notice: Could not reach or parse the AI scenario (${err.message}). Generated a realistic scenario offline instead.`);
    } finally {
      setIsGeneratingScenario(false);
    }
  };

  const handlePracticeOffline = () => {
    // One click: fresh realistic case + session starts fully offline.
    const practiceCase = generateAirlineCase({ avoidTitles: recentTitles });
    practiceCase.id = `practice_${Date.now()}`;
    setScenarios((prev) => [practiceCase, ...prev]);
    setSelectedScenario(practiceCase);
    setRecentTitles((prev) => [practiceCase.title, ...prev].slice(0, 5));
    handleStartSimulation(true);
  };

  const handleAddCustomScenario = (e) => {
    e.preventDefault();
    if (!customTitle || !customPassenger || !customDetails) return;

    const newScen = {
      id: `custom_${Date.now()}`,
      title: customTitle,
      difficulty: customDifficulty,
      passenger: customPassenger,
      pnr: customPnr || `RY${Math.floor(1000 + Math.random() * 9000)}`,
      flight: customFlight || 'FR101 (STN -> DUB)',
      details: customDetails,
      promptScenario: `You are ${customPassenger}. ${customDetails} Demand quick resolution or policy explanation from the agent.`
    };

    setScenarios((prev) => [newScen, ...prev]);
    setSelectedScenario(newScen);
    setShowCustomModal(false);
    setCustomTitle('');
    setCustomPassenger('');
    setCustomPnr('');
    setCustomFlight('');
    setCustomDetails('');
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoadingAi]);

  // Persist the LLM settings so a refresh keeps the configured endpoint.
  useEffect(() => {
    saveLlmSettings({ provider, baseUrl, apiKey, modelId, temperature, topP, maxTokens });
  }, [provider, baseUrl, apiKey, modelId, temperature, topP, maxTokens]);

  // Keep the document in step with the chosen theme and remember it.
  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  useEffect(() => {
    let interval = null;
    if (appState === 'simulating') {
      interval = setInterval(() => {
        setElapsedSeconds((e) => {
          const currentElapsed = e + 1;
          
          // Recalculate Live WPM based on elapsed duration
          if (currentElapsed > 0 && wordCount > 0) {
            const minutes = currentElapsed / 60;
            const wpm = Math.round(wordCount / Math.max(0.2, minutes));
            setLiveWpm(wpm);
          }
          return currentElapsed;
        });

        // 15-Minute Handling Time Countdown
        setTotalSeconds((prev) => {
          if (prev <= 1) {
            handleEndSession('Time limit reached (15 mins elapsed)');
            return 0;
          }
          return prev - 1;
        });

        // Decay Customer Patience dynamically based on hold or idle time
        setCustomerPatience((prevPatience) => {
          let decayRate = isOnHold ? 0.2 : 0.5;
          const nextPatience = Math.max(0, prevPatience - decayRate);

          if (nextPatience < 25 && customerSentiment !== 'Angry') {
            setCustomerSentiment('Angry');
            addEventLog('negative', -5, 'Customer patience dropped critically (<25%)');
          } else if (nextPatience < 50 && nextPatience >= 25 && customerSentiment === 'Satisfied') {
            setCustomerSentiment('Anxious');
            addEventLog('negative', -3, 'Customer became restless waiting');
          }

          return nextPatience;
        });

        // 2-Minute Response SLA Window Clock
        if (!isOnHold) {
          setResponseSeconds((prev) => {
            if (prev <= 1) {
              setResponseViolations((v) => v + 1);
              injectCustomerImpatienceMsg();
              
              addEventLog('negative', -12, '2-Minute SLA Response Breach Penalty');
              setCustomerPatience((p) => Math.max(0, p - 30));

              return 120; // reset window for next cycle
            }
            return prev - 1;
          });
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [appState, isOnHold, wordCount, customerSentiment]);

  const callGeminiCustomer = async (currentChatHistory) => {
    setIsLoadingAi(true);
    
    const systemPrompt = `You are a passenger chatting with a Ryanair Customer Service Agent on live chat.
    Scenario: ${selectedScenario.promptScenario}
    Passenger Name: ${selectedScenario.passenger}
    Booking Reference (PNR): ${selectedScenario.pnr}
    Flight: ${selectedScenario.flight}

    RULES FOR YOUR RESPONSE:
    1. Stay strictly in character as a customer.
    2. Ryanair is a digital self-service airline. If the agent directs you to perform free changes (like minor name spelling fixes within 24h) yourself on the website or mobile app, or asks for screenshot/proof of an app error before manually doing it for you, recognize this is standard company procedure and respond realistically.
    3. Keep messages concise (1-3 sentences) as typical for live customer chat.
    4. If the agent explains policy clearly and professionally, respond reasonably.
    5. Include an emotion tag at the VERY START of your response in brackets, e.g. [Sentiment: Angry] or [Sentiment: Neutral] or [Sentiment: Satisfied] or [Sentiment: Anxious].`;

    try {
      const responseText = await callLlmApi({
        systemPrompt,
        chatHistory: currentChatHistory
      });

      let cleanedText = responseText || "I am still waiting for an update regarding my issue.";
      let detectedSentiment = customerSentiment;

      const sentimentMatch = responseText.match(/\[Sentiment:\s*(\w+)\]/i);
      if (sentimentMatch) {
        detectedSentiment = sentimentMatch[1];
        cleanedText = responseText.replace(/\[Sentiment:\s*\w+\]/i, '').trim();
      }

      if (detectedSentiment === 'Satisfied' && customerSentiment !== 'Satisfied') {
        addEventLog('positive', 8, 'Customer Sentiment improved to Satisfied');
        setCustomerPatience((p) => Math.min(100, p + 30));
      } else if (detectedSentiment === 'Angry' && customerSentiment !== 'Angry') {
        addEventLog('negative', -8, 'Customer Sentiment escalated to Angry');
        setCustomerPatience((p) => Math.max(0, p - 20));
      } else if (detectedSentiment === 'Neutral' && customerSentiment === 'Angry') {
        addEventLog('positive', 4, 'Customer de-escalated to Neutral');
        setCustomerPatience((p) => Math.min(100, p + 15));
      }

      setCustomerSentiment(detectedSentiment);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'customer',
          text: cleanedText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch (err) {
      console.error('Error generating AI customer reply:', err);
      setApiError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'customer',
          text: 'Are you still there? Please confirm if you can help me with my booking.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoadingAi(false);
    }
  };

  const injectCustomerImpatienceMsg = () => {
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now(),
        sender: 'customer',
        text: 'Hello? It has been over 2 minutes. Are you still working on my case or did the connection drop?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isSystemAlert: true
      }
    ]);
    setCustomerSentiment('Anxious');
  };

  const PRACTICE_REPLIES = {
    pushback1: 'Why should I have to do that myself? I paid Ryanair for the ticket - just fix it for me in the system.',
    pushback2: 'I have already tried the app and it does not work. That is why I am chatting with you. Can you not just do it there for me?',
    pushback3: 'This is really frustrating. Fine, walk me through it again step by step please.',
    default: [
      'Okay, I understand. What do I need to do exactly?',
      'Right, that makes sense. How long will that take?',
      'Thanks for explaining. So I just do that in the app myself?',
      'Okay... but I still think Ryanair should cover this. What can you actually do for me today?'
    ],
    satisfied: [
      'That worked, thank you! Sorry for being short earlier, I was stressed.',
      'Perfect, all sorted on my side now. Thanks for the help.',
      'Great, that makes sense now. I appreciate you explaining it properly.'
    ],
    onHold: 'Still waiting here... can you see my booking on your side?'
  };

  // Generates an offline customer reply so Practice Offline sessions exercise the
  // full live KPI engine (SLA clock, patience, sentiment, score) with no LLM calls.
  const getPracticeReply = (agentText) => {
    const lower = (agentText || '').toLowerCase();
    const satisfiedNow = customerSentiment === 'Satisfied';

    if (/hold/.test(lower) && isOnHold) return PRACTICE_REPLIES.onHold;
    if (satisfiedNow && rand2.pick(PRACTICE_REPLIES.satisfied)) {
      return rand2.pick(PRACTICE_REPLIES.satisfied);
    }

    // Pushback until the agent genuinely directs the customer to self-service or
    // acknowledges the issue; then follow the arc: pushback x2 -> cooperate.
    const pushesSelfService = /(app|website|web|self[- ]?service|online|yourself|your self)/.test(lower);
    const acknowledges = /(sorry|apolog|understand|thank you for waiting|i can see|let me)/.test(lower);
    const pushbackCount = practicePushbacksRef.current;

    if (!satisfiedNow) {
      if (pushbackCount < 2 && !(pushesSelfService && acknowledges)) {
        practicePushbacksRef.current = pushbackCount + 1;
        return PRACTICE_REPLIES['pushback' + Math.min(3, pushbackCount + 1)];
      }
      if (pushesSelfService) {
        practicePushbacksRef.current = Math.max(0, pushbackCount - 1);
        return rand2.pick([
          'Okay, show me where that is in the app then.',
          'Fine, I will try that. What exactly do I tap?',
          'Alright, if that is the policy I will do it in the app.'
        ]);
      }
    }
    return rand2.pick(PRACTICE_REPLIES.default);
  };

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const responseTimeSecs = 120 - responseSeconds;
    if (responseTimeSecs < 25) {
      addEventLog('positive', 2, `Rapid reply in ${responseTimeSecs}s (+2 pts)`);
    } else if (responseTimeSecs > 90) {
      addEventLog('negative', -2, `Slow response duration (${responseTimeSecs}s)`);
    }

    setCustomerPatience((p) => Math.min(100, p + 20));
    setResponseSeconds(120);

    const words = inputMessage.trim().split(/\s+/).length;
    const newTotalWords = wordCount + words;
    setWordCount(newTotalWords);

    if (elapsedSeconds > 0) {
      const minutes = elapsedSeconds / 60;
      setLiveWpm(Math.round(newTotalWords / Math.max(0.2, minutes)));
    }

    const newAgentMsg = {
      id: Date.now(),
      sender: 'agent',
      text: inputMessage,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const updatedHistory = [...messages, newAgentMsg];
    setMessages(updatedHistory);
    setInputMessage('');

    if (isOnHold) {
      setIsOnHold(false);
      addEventLog('neutral', 0, 'Resumed customer from hold');
    }

    if (isPracticeMode) {
      // Practice Offline: the simulated customer is a local script, so the
      // session works with zero LLM configuration and still moves every KPI.
      setIsLoadingAi(true);
      practiceTimerRef.current = setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + Math.random(),
            sender: 'customer',
            text: getPracticeReply(currentChatHistory[currentChatHistory.length - 1]?.text),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setIsLoadingAi(false);
      }, 1500 + Math.random() * 2500);
      return;
    }

    callGeminiCustomer(updatedHistory);
  };

  const handleToggleHold = () => {
    const nextHoldState = !isOnHold;
    setIsOnHold(nextHoldState);

    if (nextHoldState) {
      setHoldCount((prev) => prev + 1);
      addEventLog('neutral', -2, 'Placed customer on hold');
      
      const holdMsgText = "I am placing you on a brief hold while I review your booking details and Ryanair system logs. Thank you for your patience.";
      const newAgentMsg = {
        id: Date.now(),
        sender: 'agent',
        text: holdMsgText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isHoldNotice: true
      };
      setMessages((prev) => [...prev, newAgentMsg]);
    } else {
      addEventLog('positive', 1, 'Resumed customer from hold promptly');
      const resumeMsgText = "Thank you for holding. I am back with you now.";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'agent',
          text: resumeMsgText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setResponseSeconds(120);
    }
  };

  const handleInsertCanned = (text) => {
    setInputMessage(text);
  };

  const handleStartSimulation = (practice = false) => {
    setIsPracticeMode(practice);
    practicePushbacksRef.current = 0;
    if (practiceTimerRef.current) clearTimeout(practiceTimerRef.current);
    setAppState('simulating');
    setTotalSeconds(15 * 60);
    setResponseSeconds(120);
    setElapsedSeconds(0);
    setIsOnHold(false);
    setWordCount(0);
    setResponseViolations(0);
    setHoldCount(0);
    setCustomerSentiment('Neutral');
    setCustomerPatience(100);
    setLiveScore(100);
    setLiveWpm(0);
    setEventLog([
      {
        id: Date.now(),
        type: 'neutral',
        delta: 0,
        label: 'Session initialized. Baseline Quality: 100%',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    ]);

    const initialMsg = {
      id: Date.now(),
      sender: 'customer',
      text: `Hello, my name is ${selectedScenario.passenger} (Booking ref: ${selectedScenario.pnr}). I need urgent assistance with my flight ${selectedScenario.flight}. ${selectedScenario.details}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages([initialMsg]);
  };

  const handleEndSession = async (reason = 'Agent Resolved Chat') => {
    if (practiceTimerRef.current) {
      clearTimeout(practiceTimerRef.current);
      practiceTimerRef.current = null;
    }
    setAppState('scorecard');
    setIsEvaluating(true);

    const durationMinutes = (elapsedSeconds / 60).toFixed(1);
    const finalWpm = liveWpm;

    if (isPracticeMode) {
      // Practice Offline: no LLM audit call - grade locally with the same
      // deterministic formulas, so a full KPI run works with zero setup.
      const finalCard = {
        sopAccuracy: Math.min(100, Math.max(60, liveScore)),
        communicationScore: Math.min(100, Math.max(50, 100 - responseViolations * 15)),
        timeSlaScore: responseViolations === 0 ? 95 : Math.max(40, 100 - responseViolations * 20),
        grade: liveScore >= 90 ? 'A+' : liveScore >= 80 ? 'A' : liveScore >= 70 ? 'B' : liveScore >= 60 ? 'C' : 'F',
        strengths: [
          'Completed the chat inside the 15-minute handling target.',
          customerSentiment === 'Satisfied' || customerSentiment === 'Neutral'
            ? 'Kept the customer calm and cooperative throughout.'
            : 'Engaged with an agitated customer and kept the chat moving.',
          responseViolations === 0
            ? 'Answered within the 2-minute SLA window every time.'
            : 'Maintained contact with the customer despite SLA pressure.'
        ],
        improvements: [
          'Rehearse the exact self-service wording: name the app step, then the free 24-hour rule.',
          'Acknowledge frustration in your first sentence before explaining policy.',
          responseViolations > 0
            ? 'Send even a short holding reply ("checking now") to stop the 2-minute clock.'
            : 'Practise de-escalation lines to move Angry customers to Neutral faster.'
        ],
        summary: `Offline practice session audited locally (no AI evaluation call). Final live quality score was ${liveScore}%. Handling time ${durationMinutes} minutes with ${responseViolations} SLA breaches and ${holdCount} hold(s). Final sentiment: ${customerSentiment}.`,
        handlingTime: `${durationMinutes} mins`,
        wpm: finalWpm,
        violations: responseViolations,
        holds: holdCount,
        finalLiveScore: liveScore
      };
      setScorecard(finalCard);
      recordHistory(finalCard);
      setIsEvaluating(false);
      return;
    }

    const evalPrompt = `You are a Senior Ryanair Customer Operations Auditor evaluating an agent's live chat performance.
    
    CRITICAL RYANAIR OPERATIONAL POLICY RULES TO EVALUATE AGENT:
    - Ryanair is a digital App/Web Self-Service First airline.
    - Agents are EXPECTED and MANDATED to direct customers to perform eligible free changes (like 24-hour name spelling corrections up to 3 characters) on the website or mobile app themselves.
    - Agents are MANDATED to ask for proof/screenshot of technical failure before performing manual overrides that the customer can do themselves.
    - DO NOT penalize the agent for enforcing the self-service policy or requesting proof of technical error; REWARD them for following standard company procedure!
    
    SCENARIO DETAILS:
    - Customer: ${selectedScenario.passenger}
    - Issue: ${selectedScenario.details}
    
    AGENT METRICS:
    - Final Dynamic Quality Score: ${liveScore}/100
    - Total Handling Time: ${durationMinutes} minutes (Target: < 15.0 mins)
    - 2-Minute Window Breaches: ${responseViolations} times
    - Customer Holds Taken: ${holdCount}
    - Final Customer Patience Level: ${Math.round(customerPatience)}%
    - Final Customer Sentiment: ${customerSentiment}
    - Average Typing Speed: ${finalWpm} WPM
    - Exit Reason: ${reason}
    
    CHAT TRANSCRIPT:
    ${messages.map((m) => `${m.sender.toUpperCase()}: ${m.text}`).join('\n')}
    
    TASK: Evaluate the agent in JSON format. Return ONLY the JSON object.
    {
      "sopAccuracy": number between 0-100,
      "communicationScore": number between 0-100,
      "timeSlaScore": number between 0-100,
      "grade": "A+" | "A" | "B" | "C" | "F",
      "strengths": ["string", "string", "string"],
      "improvements": ["string", "string", "string"],
      "summary": "paragraph text"
    }`;

    const jsonSchema = {
      type: "OBJECT",
      properties: {
        sopAccuracy: { type: "NUMBER" },
        communicationScore: { type: "NUMBER" },
        timeSlaScore: { type: "NUMBER" },
        grade: { type: "STRING" },
        strengths: { type: "ARRAY", items: { type: "STRING" } },
        improvements: { type: "ARRAY", items: { type: "STRING" } },
        summary: { type: "STRING" }
      },
      propertyOrdering: ["sopAccuracy", "communicationScore", "timeSlaScore", "grade", "strengths", "improvements", "summary"]
    };

    try {
      const rawText = await callLlmApi({
        systemPrompt: evalPrompt,
        chatHistory: [],
        jsonSchema,
        overrideMaxTokens: 2048
      });

      const resultJson = cleanAndParseJson(rawText);
      
      const finalCard = {
        ...resultJson,
        handlingTime: `${durationMinutes} mins`,
        wpm: finalWpm,
        violations: responseViolations,
        holds: holdCount,
        finalLiveScore: liveScore
      };
      setScorecard(finalCard);
      recordHistory(finalCard);
    } catch (err) {
      console.error('Failed to generate AI evaluation:', err);
      // Fallback evaluation if JSON parsing fails
      const fallbackCard = {
        sopAccuracy: Math.min(100, Math.max(60, liveScore)),
        communicationScore: Math.min(100, Math.max(50, 100 - (responseViolations * 15))),
        timeSlaScore: responseViolations === 0 ? 95 : Math.max(40, 100 - (responseViolations * 20)),
        grade: liveScore >= 90 ? 'A+' : liveScore >= 80 ? 'A' : liveScore >= 70 ? 'B' : liveScore >= 60 ? 'C' : 'F',
        strengths: [
          'Adhered to Ryanair digital self-service policy guidelines.',
          'Maintained communication within active handling windows.',
          'Addressed customer booking details accurately.'
        ],
        improvements: [
          'Ensure customer holds are communicated clearly beforehand.',
          'Acknowledge passenger frustrations promptly during interaction.'
        ],
        summary: `The session was audited automatically. Final live quality score was ${liveScore}%. Total handling duration was ${durationMinutes} minutes with ${responseViolations} SLA breaches.`,
        handlingTime: `${durationMinutes} mins`,
        wpm: finalWpm,
        violations: responseViolations,
        holds: holdCount,
        finalLiveScore: liveScore
      };
      setScorecard(fallbackCard);
      recordHistory(fallbackCard);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Snapshot a finished session into the persistent KPI history.
  const recordHistory = (card) => {
    const entry = sanitizeSession({
      at: Date.now(),
      mode: isPracticeMode ? 'practice' : 'ai',
      grade: card.grade,
      score: card.finalLiveScore,
      sop: card.sopAccuracy,
      communication: card.communicationScore,
      timeSla: card.timeSlaScore,
      handlingTime: card.handlingTime,
      violations: card.violations,
      holds: card.holds,
      wpm: card.wpm,
      sentiment: customerSentiment,
      title: selectedScenario ? selectedScenario.title : 'Untitled case'
    });
    setSessionHistory((prev) => {
      const next = appendSession(prev, entry);
      saveSessionHistory(next);
      return next;
    });
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const filteredSop = RYANAIR_SOP.filter(
    (item) =>
      item.title.toLowerCase().includes(sopSearch.toLowerCase()) ||
      item.category.toLowerCase().includes(sopSearch.toLowerCase()) ||
      item.content.toLowerCase().includes(sopSearch.toLowerCase())
  );

  // Home-screen KPI dashboard aggregates over the persistent session history.
  const totalSessions = sessionHistory.length;
  const avgScore = totalSessions ? Math.round(sessionHistory.reduce((s, e) => s + e.score, 0) / totalSessions) : 0;
  const bestScore = totalSessions ? Math.max(...sessionHistory.map((e) => e.score)) : 0;
  const slaCleanRate = totalSessions ? Math.round((sessionHistory.filter((e) => e.violations === 0).length / totalSessions) * 100) : 0;

  return (
    <div className="h-dvh bg-canvas text-ink font-sans flex flex-col overflow-hidden">
      {/* HEADER BAR WITH LIVE CONNECTED KPI HUD */}
      <header className="bg-surface border-b border-line px-3 sm:px-5 py-2 flex flex-wrap items-center gap-x-3 gap-y-2 shadow-sm shrink-0">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="bg-brand text-on-brand p-2 rounded-xl shadow-sm shrink-0">
            <Plane className="w-5 h-5 fill-current rotate-45" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold text-ink tracking-tight flex items-center gap-2">
              <span className="truncate">Ryanair Agent Simulator</span>
              <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-wider text-brand bg-brand/10 border border-brand/30 px-1.5 py-0.5 rounded shrink-0">KPI Lab</span>
            </h1>
            <p className="hidden sm:block text-[11px] text-ink-3">Interconnected Performance Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setTheme((prev) => nextTheme(prev))}
            className="bg-surface-2 hover:bg-surface-3 text-ink-2 hover:text-ink border border-line p-2 rounded-lg transition shrink-0"
            title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              setLlmTest(null);
              setShowSettingsModal(true);
            }}
            className="bg-surface-2/80 hover:bg-surface-3 text-ink border border-line px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition"
            title="Configure LLM Endpoint & Parameters"
          >
            <Settings className="w-3.5 h-3.5 text-warn" />
            <span className="hidden md:inline">LLM Settings</span>
            <span className="hidden lg:inline text-[10px] bg-surface px-1.5 py-0.5 rounded font-mono text-brand">
              {provider === 'openai_compatible' ? 'OpenAI Compatible' : 'Gemini'}
            </span>
          </button>

          {appState === 'simulating' && (
            <div className="order-last w-full xl:order-none xl:w-auto flex items-center gap-2 sm:gap-3 overflow-x-auto custom-scrollbar -mx-3 px-3 sm:mx-0 sm:px-0 pb-0.5 sm:pb-0">
              {/* Live Interconnected Quality Rating */}
              <div className="shrink-0 flex items-center space-x-2 bg-canvas/80 px-3 py-1.5 rounded-lg border border-line/80">
                <Gauge className="w-4 h-4 text-ok" />
                <div>
                  <p className="text-[9px] text-ink-3 font-medium uppercase tracking-wider">Live Quality Score</p>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm font-mono font-black ${
                      liveScore >= 85 ? 'text-ok' : liveScore >= 70 ? 'text-warn' : 'text-danger'
                    }`}>
                      {liveScore}%
                    </span>
                    <div className="w-12 bg-surface-2 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          liveScore >= 85 ? 'bg-ok' : liveScore >= 70 ? 'bg-warn' : 'bg-danger'
                        }`} 
                        style={{ width: `${liveScore}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 15-Min Handling Clock */}
              <div className="shrink-0 flex items-center space-x-2 bg-surface-2/80 px-3 py-1.5 rounded-lg border border-line">
                <Clock className={`w-4 h-4 ${totalSeconds < 180 ? 'text-danger animate-pulse' : 'text-brand'}`} />
                <div>
                  <p className="text-[9px] text-ink-3 font-medium uppercase tracking-wider">Target Resolution</p>
                  <p className={`text-xs font-mono font-bold ${totalSeconds < 180 ? 'text-danger' : 'text-ink'}`}>
                    {formatTime(totalSeconds)} / 15:00
                  </p>
                </div>
              </div>

              {/* 2-Min Response Window Clock */}
              <div className={`shrink-0 flex items-center space-x-2 px-3 py-1.5 rounded-lg border transition-all ${
                isOnHold 
                  ? 'bg-warn/15 border-warn/30 text-warn' 
                  : responseSeconds < 30 
                  ? 'bg-danger/20 border-danger text-danger animate-pulse' 
                  : 'bg-surface-2/80 border-line text-ink'
              }`}>
                <Zap className="w-4 h-4 text-warn" />
                <div>
                  <p className="text-[9px] text-ink-3 font-medium uppercase tracking-wider">
                    {isOnHold ? 'Customer on Hold' : '2-Min SLA Window'}
                  </p>
                  <p className="text-xs font-mono font-bold">
                    {isOnHold ? 'PAUSED' : formatTime(responseSeconds)}
                  </p>
                </div>
              </div>

              <span className="shrink-0 text-[10px] font-mono bg-ok/15 text-ok border border-ok/30 px-2 py-1 rounded">
                {isPracticeMode ? 'PRACTICE OFFLINE' : 'AI CONNECTED'}
              </span>

              <button
                onClick={() => handleEndSession('Agent Manually Resolved')}
                className="shrink-0 bg-ok-strong hover:bg-ok text-on-brand px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow flex items-center space-x-1.5 transition"
              >
                <CheckCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Resolve Chat</span>
                <span className="sm:hidden">Resolve</span>
              </button>
            </div>
          )}
        </div>
      </header>
      {/* Signature airline hairline in the secondary accent colour */}
      <div className="h-0.5 bg-accent/60 shrink-0"></div>

      {/* API ERROR BANNER */}
      {apiError && (
        <div className="bg-danger/20 border-b border-danger px-3 sm:px-4 py-2 text-xs text-danger flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-danger shrink-0" />
            <span className="font-medium break-words">{apiError}</span>
          </div>
          <button onClick={() => setApiError(null)} className="text-danger hover:text-ink font-bold text-xs shrink-0">Dismiss</button>
        </div>
      )}

      {}
      {/* HOME-SCREEN KPI DASHBOARD (persistent across refreshes) */}
      {appState === 'setup' && (
        <div className="max-w-5xl mx-auto w-full px-3 sm:px-6 pt-4 sm:pt-6">
          <div className="rounded-2xl bg-surface border border-line p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-brand" />
                <h3 className="text-sm font-bold text-ink tracking-wide">Your KPI Dashboard</h3>
                <span className="text-[10px] text-ink-4">across {totalSessions} saved session{totalSessions === 1 ? '' : 's'}</span>
              </div>
              {totalSessions > 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear all saved session history? This cannot be undone.')) {
                      clearSessionHistory();
                      setSessionHistory([]);
                    }
                  }}
                  className="text-[10px] font-semibold text-ink-3 hover:text-danger transition"
                >
                  Clear
                </button>
              )}
            </div>
            {totalSessions === 0 ? (
              <p className="text-xs text-ink-3">No sessions yet. Finish an AI or offline practice chat and its KPIs will be logged here permanently.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <KpiTile label="Sessions" value={totalSessions} icon={<Activity className="w-3 h-3 text-brand" />} />
                  <KpiTile label="Avg Score" value={avgScore + '%'} icon={<Gauge className="w-3 h-3 text-ok" />} />
                  <KpiTile label="Best Score" value={bestScore + '%'} icon={<Award className="w-3 h-3 text-warn" />} />
                  <KpiTile label="SLA Clean" value={slaCleanRate + '%'} icon={<CheckCircle className="w-3 h-3 text-brand" />} />
                </div>
                <button
                  onClick={() => setShowHistoryList((v) => !v)}
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-ink bg-surface/40 border border-line/60 rounded-lg py-2 transition"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>{showHistoryList ? 'Hide' : 'Show'} session log ({totalSessions})</span>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showHistoryList ? 'rotate-90' : ''}`} />
                </button>
                {showHistoryList && (
                  <div className="mt-3 space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {sessionHistory.map((e) => (
                      <div key={e.at + e.title} className="flex items-center justify-between gap-3 rounded-lg bg-surface/40 border border-line/50 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${e.mode === 'practice' ? 'bg-ok/15 text-ok' : 'bg-brand/20 text-brand'}`}>{e.mode === 'practice' ? 'Offline' : 'AI'}</span>
                            <span className="text-ink font-semibold truncate">{e.title}</span>
                          </div>
                          <div className="text-[10px] text-ink-4 mt-0.5">{new Date(e.at).toLocaleString()} · {e.handlingTime || '—'} · {e.violations} SLA · {e.holds} hold(s) · {e.sentiment}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-base font-black text-ink leading-none">{e.score}%</div>
                          <div className="text-[10px] text-ink-4">Grade {e.grade}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {appState === 'setup' && (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
          <div className="max-w-5xl mx-auto w-full p-3 sm:p-6 my-auto">
          <div className="text-center mb-7">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-brand bg-brand/10 border border-brand/30 px-2.5 py-1 rounded-full mb-3">
              <Sparkles className="w-3 h-3" /> Case Library
            </span>
            <h2 className="text-3xl font-black text-ink tracking-tight">Pick a case to simulate</h2>
            <p className="text-sm text-ink-3 max-w-xl mx-auto mt-2">
              Every case is generated fresh. Run it as a live chat while the KPI engine scores your response SLA, customer patience, sentiment and policy compliance.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              {[
                { icon: <Clock className="w-3 h-3" />, label: '2-min response SLA' },
                { icon: <Gauge className="w-3 h-3" />, label: '15-min handling limit' },
                { icon: <Activity className="w-3 h-3" />, label: 'Live quality score' },
                { icon: <ShieldAlert className="w-3 h-3" />, label: 'Policy audit' }
              ].map((chip) => (
                <span key={chip.label} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-2 bg-surface border border-line px-2.5 py-1 rounded-lg">
                  <span className="text-brand">{chip.icon}</span>
                  {chip.label}
                </span>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-5">
              <button
                onClick={handleGenerateAiScenario}
                disabled={isGeneratingScenario}
                className="w-full sm:w-auto justify-center bg-brand hover:bg-brand-strong disabled:opacity-50 text-on-brand font-semibold text-xs px-4 py-2.5 rounded-xl shadow border border-brand/30 flex items-center space-x-2 transition"
              >
                <Zap className={`w-4 h-4 text-warn ${isGeneratingScenario ? 'animate-spin' : ''}`} />
                <span>{isGeneratingScenario ? 'Generating AI Case...' : 'Generate AI Case'}</span>
              </button>

              <button
                onClick={handlePracticeOffline}
                className="w-full sm:w-auto justify-center bg-ok-strong hover:bg-ok text-on-brand font-semibold text-xs px-4 py-2.5 rounded-xl shadow border border-ok/30 flex items-center space-x-1.5 transition hover:-translate-y-0.5"
              >
                <Play className="w-4 h-4" />
                <span>Practice Offline (No AI)</span>
              </button>

              <button
                onClick={() => setShowCustomModal(true)}
                className="w-full sm:w-auto justify-center bg-surface-2 hover:bg-surface-3 text-ink font-semibold text-xs px-4 py-2.5 rounded-xl shadow border border-line flex items-center space-x-1.5 transition"
              >
                <Plus className="w-4 h-4 text-brand" />
                <span>Build Custom Case</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 mb-6">
            {scenarios.length === 0 && (
              <div className="md:col-span-3 rounded-2xl p-10 border border-dashed border-line-strong bg-surface-2/40 text-center">
                <div className="w-11 h-11 rounded-xl bg-brand/10 border border-brand/30 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-5 h-5 text-brand" />
                </div>
                <p className="text-sm font-semibold text-ink mb-1">No cases yet</p>
                <p className="text-xs text-ink-3 max-w-md mx-auto">
                  Every case is generated fresh - use "Generate AI Case" for a random realistic Ryanair issue (falls back to the built-in offline generator if the AI is unreachable), or "Build Custom Case" to write your own.
                </p>
              </div>
            )}
            {scenarios.map((scen) => (
              <div
                key={scen.id}
                onClick={() => setSelectedScenario(scen)}
                className={`group cursor-pointer rounded-2xl p-5 border transition-all duration-200 relative flex flex-col justify-between ${
                  selectedScenario?.id === scen.id
                    ? 'bg-brand/10 border-brand shadow-lg shadow-brand/20 ring-2 ring-brand'
                    : 'bg-surface border-line hover:border-line-strong hover:bg-surface-2 hover:-translate-y-0.5 hover:shadow-lg'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                      scen.difficulty === 'Easy' ? 'bg-ok/15 text-ok border border-ok/30' :
                      scen.difficulty === 'Medium' ? 'bg-warn/15 text-warn border border-warn/30' :
                      'bg-danger/15 text-danger border border-danger/30'
                    }`}>
                      {scen.difficulty}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs font-mono text-ink-3">
                      {selectedScenario?.id === scen.id && <Check className="w-3.5 h-3.5 text-brand" />}
                      {scen.pnr}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-ink mb-2">{scen.title}</h3>
                  <p className="text-xs text-ink-2 mb-4 line-clamp-3 leading-relaxed">{scen.details}</p>
                </div>

                <div className="pt-3 border-t border-line/60 flex items-center justify-between text-xs text-ink-3">
                  <span className="flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-ink-4" /> {scen.passenger}
                  </span>
                  <span className="flex items-center gap-1 font-mono text-ink-2">
                    <Plane className="w-3.5 h-3.5 text-brand" /> {scen.flight}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center">
            <button
              onClick={handleStartSimulation}
              disabled={!selectedScenario}
              title={selectedScenario ? 'Start the live chat simulation' : 'Generate or build a case first'}
              className={`w-full sm:w-auto justify-center bg-brand text-on-brand font-bold px-8 py-3.5 rounded-xl shadow-lg shadow-brand/25 transition duration-200 flex items-center gap-2 mx-auto ${selectedScenario ? 'hover:bg-brand-strong hover:scale-[1.02]' : 'opacity-40 shadow-none cursor-not-allowed'}`}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>Start Connected Live Simulation</span>
            </button>
            {!selectedScenario && (
              <p className="text-xs text-warn/90 mt-2">Generate a case above to enable the simulation.</p>
            )}
          </div>
        </div>
        </div>
      )}

      {/* CUSTOM CASE MODAL */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-canvas/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 max-w-md w-full shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto custom-scrollbar my-auto">
            <h3 className="text-lg font-bold text-ink flex items-center gap-2">
              <Plus className="w-5 h-5 text-brand" /> Build Custom Scenario
            </h3>
            <form onSubmit={handleAddCustomScenario} className="space-y-3 text-xs">
              <div>
                <label className="block text-ink-2 mb-1">Scenario Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Baggage Overweight Dispute"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-ink-2 mb-1">Passenger Name</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    value={customPassenger}
                    onChange={(e) => setCustomPassenger(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink"
                  />
                </div>
                <div>
                  <label className="block text-ink-2 mb-1">Difficulty</label>
                  <select
                    value={customDifficulty}
                    onChange={(e) => setCustomDifficulty(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label className="block text-ink-2 mb-1">PNR Ref</label>
                  <input
                    type="text"
                    placeholder="RY991A"
                    value={customPnr}
                    onChange={(e) => setCustomPnr(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink font-mono"
                  />
                </div>
                <div>
                  <label className="block text-ink-2 mb-1">Flight</label>
                  <input
                    type="text"
                    placeholder="FR101 (STN -> DUB)"
                    value={customFlight}
                    onChange={(e) => setCustomFlight(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-ink-2 mb-1">Issue Details & Customer Demands</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Describe the problem..."
                  value={customDetails}
                  onChange={(e) => setCustomDetails(e.target.value)}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="bg-surface-2 hover:bg-surface-3 text-ink-2 px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-brand-strong hover:bg-brand-strong text-on-brand px-4 py-2 rounded-lg font-semibold"
                >
                  Save Scenario
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-canvas/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface border border-line rounded-2xl p-4 sm:p-6 max-w-xl w-full shadow-2xl space-y-5 max-h-[92dvh] overflow-y-auto custom-scrollbar my-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-lg font-bold text-ink flex items-center gap-2">
                <Settings className="w-5 h-5 text-warn" /> LLM & Endpoint Settings
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-ink-3 hover:text-ink text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Provider Selection */}
              <div>
                <label className="block text-ink-2 mb-1.5 font-medium flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-brand" /> API Provider Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProvider('gemini');
                      setModelId('gemini-3-flash-preview');
                    }}
                    className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between transition ${
                      provider === 'gemini' 
                        ? 'bg-brand/20 border-brand text-ink font-bold' 
                        : 'bg-surface-2 border-line text-ink-3 hover:bg-surface-3'
                    }`}
                  >
                    <span>Google Gemini</span>
                    {provider === 'gemini' && <Check className="w-3.5 h-3.5 text-brand" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider('openai_compatible');
                      if (modelId === 'gemini-3-flash-preview') setModelId('gpt-4o-mini');
                    }}
                    className={`py-2 px-3 rounded-lg border text-left flex items-center justify-between transition ${
                      provider === 'openai_compatible' 
                        ? 'bg-brand/15 border-brand text-ink font-bold' 
                        : 'bg-surface-2 border-line text-ink-3 hover:bg-surface-3'
                    }`}
                  >
                    <span>OpenAI / Custom Endpoint</span>
                    {provider === 'openai_compatible' && <Check className="w-3.5 h-3.5 text-brand" />}
                  </button>
                </div>
              </div>

              {/* Base URL (for OpenAI Compatible) */}
              {provider === 'openai_compatible' && (
                <div>
                  <label className="block text-ink-2 mb-1 font-medium flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-brand" /> Custom Base URL
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. https://api.openai.com/v1 or http://localhost:11434/v1"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink font-mono focus:outline-none focus:border-brand"
                  />
                  <p className="text-[10px] text-ink-3 mt-1">Supports OpenAI, OpenRouter, Ollama, LM Studio, LocalAI, vLLM, etc. A browser cannot call a local server that has no CORS headers - local <code className="text-brand font-mono">http://localhost:...</code> URLs are rerouted through the Vite proxy automatically, or set the Base URL to <code className="text-brand font-mono">/llm-proxy/v1</code> explicitly.</p>
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="block text-ink-2 mb-1 font-medium flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-warn" /> API Key
                </label>
                <input
                  type="password"
                  placeholder={provider === 'openai_compatible' ? "sk-..." : "Gemini API Key..."}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink font-mono focus:outline-none focus:border-brand"
                />
              </div>

              {/* Model ID */}
              <div>
                <label className="block text-ink-2 mb-1 font-medium flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-ok" /> Model ID
                </label>
                <input
                  type="text"
                  placeholder={provider === 'openai_compatible' ? "e.g. gpt-4o-mini, llama-3.1-8b, claude-3-5-sonnet" : "e.g. gemini-3-flash-preview"}
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-ink font-mono focus:outline-none focus:border-brand"
                />
              </div>

              {/* Hyperparameters Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-ink-3 mb-1">Temperature ({temperature})</label>
                  <input
                    type="range"
                    min="0.0"
                    max="1.5"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full accent-brand"
                  />
                </div>
                <div>
                  <label className="block text-ink-3 mb-1">Top P ({topP})</label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={topP}
                    onChange={(e) => setTopP(parseFloat(e.target.value))}
                    className="w-full accent-ok"
                  />
                </div>
                <div>
                  <label className="block text-ink-3 mb-1">Max Tokens</label>
                  <input
                    type="number"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-ink font-mono focus:outline-none focus:border-brand"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-line">
              <div className="text-[11px] leading-snug min-h-[16px]">
                {llmTest === null ? (
                  <span className="text-ink-4">Connection not tested yet.</span>
                ) : llmTest.state === 'testing' ? (
                  <span className="text-brand flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 animate-spin" />
                    {llmTest.message}
                  </span>
                ) : (
                  <span
                    className={
                      llmTest.state === 'ok'
                        ? 'text-ok'
                        : llmTest.state === 'warn'
                        ? 'text-warn'
                        : 'text-danger'
                    }
                  >
                    {llmTest.state === 'ok' ? (
                      <CheckCircle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    )}
                    {llmTest.message}
                  </span>
                )}
                <div className="text-[10px] text-ink-4 mt-0.5">
                  Saved in this browser and restored after a refresh.
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <button
                  type="button"
                  onClick={handleResetLlmSettings}
                  title="Forget the settings saved in this browser and restore the defaults"
                  className="text-ink-3 hover:text-ink hover:bg-surface-2 px-2.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestLlmConnection}
                  disabled={llmTest?.state === 'testing'}
                  title="Send one small request to the configured LLM and report the result"
                  className="bg-surface-2/80 hover:bg-surface-3 disabled:opacity-50 text-ink border border-line px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Activity
                    className={`w-3.5 h-3.5 text-ok ${llmTest?.state === 'testing' ? 'animate-spin' : ''}`}
                  />
                  <span>{llmTest?.state === 'testing' ? 'Testing...' : 'Test Connection'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="bg-brand-strong hover:bg-brand-strong text-on-brand px-5 py-2 rounded-lg font-semibold text-xs transition"
                >
                  Save & Apply Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {}
      {appState === 'simulating' && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Pane switcher for narrow screens; the three panels sit side by side from lg up */}
          <div className="lg:hidden flex items-center gap-1 p-2 bg-surface border-b border-line shrink-0">
            {[
              { id: 'case', label: 'Case', icon: <User className="w-3.5 h-3.5" /> },
              { id: 'chat', label: 'Chat', icon: <MessageSquare className="w-3.5 h-3.5" /> },
              { id: 'policy', label: 'Policy', icon: <BookOpen className="w-3.5 h-3.5" /> }
            ].map((pane) => (
              <button
                key={pane.id}
                onClick={() => setActivePane(pane.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold border transition ${
                  activePane === pane.id
                    ? 'bg-brand text-on-brand border-brand'
                    : 'bg-surface-2 text-ink-2 border-line hover:bg-surface-3'
                }`}
              >
                {pane.icon}
                {pane.label}
              </button>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden min-h-0">
          {/* LEFT SIDEBAR: Passenger Profile & Telemetry */}
          <div className={`lg:col-span-3 ${activePane === 'case' ? 'flex' : 'hidden'} lg:flex bg-surface-2/50 lg:border-r border-line p-3 sm:p-4 flex-col gap-4 overflow-y-auto min-h-0 custom-scrollbar`}>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-brand" /> Passenger Information
              </h3>
              <div className="bg-surface/90 border border-line/80 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-1.5">
                  <span className="text-ink-3">Name</span>
                  <span className="font-bold text-ink text-right break-words">{selectedScenario.passenger}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-1.5">
                  <span className="text-ink-3">PNR Reference</span>
                  <span className="font-mono font-bold text-warn text-right break-all">{selectedScenario.pnr}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3 border-b border-line pb-1.5">
                  <span className="text-ink-3">Flight No.</span>
                  <span className="font-mono text-ink text-right break-words">{selectedScenario.flight}</span>
                </div>
                <div className="flex flex-wrap justify-between gap-x-3">
                  <span className="text-ink-3">Difficulty</span>
                  <span className="font-bold text-ok text-right">{selectedScenario.difficulty}</span>
                </div>
              </div>
            </div>

            {/* Live Connected KPI Metrics Panel */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-ok" /> Live Operational Metrics
              </h3>
              <div className="bg-surface/90 border border-line/80 rounded-xl p-3 space-y-3">
                {/* Customer Patience Bar */}
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-ink-3 font-medium">Customer Patience</span>
                    <span className={`font-mono font-bold ${
                      customerPatience > 60 ? 'text-ok' : customerPatience > 30 ? 'text-warn' : 'text-danger'
                    }`}>{Math.round(customerPatience)}%</span>
                  </div>
                  <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-300 ${
                        customerPatience > 60 ? 'bg-ok' : customerPatience > 30 ? 'bg-warn' : 'bg-danger'
                      }`}
                      style={{ width: `${customerPatience}%` }}
                    ></div>
                  </div>
                </div>

                {/* Metric Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                  <div className="bg-surface-2/80 p-2 rounded border border-line/60">
                    <p className="text-[10px] text-ink-3">Typing Speed</p>
                    <p className="text-sm font-bold font-mono text-brand">{liveWpm} WPM</p>
                  </div>
                  <div className="bg-surface-2/80 p-2 rounded border border-line/60">
                    <p className="text-[10px] text-ink-3">SLA Violations</p>
                    <p className={`text-sm font-bold font-mono ${responseViolations > 0 ? 'text-danger' : 'text-ok'}`}>
                      {responseViolations}
                    </p>
                  </div>
                  <div className="bg-surface-2/80 p-2 rounded border border-line/60">
                    <p className="text-[10px] text-ink-3">Holds Count</p>
                    <p className="text-sm font-bold font-mono text-ink">{holdCount}</p>
                  </div>
                  <div className="bg-surface-2/80 p-2 rounded border border-line/60">
                    <p className="text-[10px] text-ink-3">Sentiment</p>
                    <p className={`text-xs font-bold mt-0.5 flex items-center gap-1 ${
                      customerSentiment === 'Angry' ? 'text-danger' :
                      customerSentiment === 'Anxious' ? 'text-warn' :
                      customerSentiment === 'Satisfied' ? 'text-ok' : 'text-ink-2'
                    }`}>
                      {customerSentiment === 'Angry' && <Frown className="w-3.5 h-3.5" />}
                      {customerSentiment === 'Anxious' && <Meh className="w-3.5 h-3.5" />}
                      {customerSentiment === 'Satisfied' && <Smile className="w-3.5 h-3.5" />}
                      {customerSentiment}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Hold Control Button */}
            <div>
              <button
                onClick={handleToggleHold}
                className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition border ${
                  isOnHold
                    ? 'bg-warn-strong hover:bg-warn-strong text-on-brand border-warn shadow-md'
                    : 'bg-surface-2 hover:bg-surface-3 text-warn border-warn/30'
                }`}
              >
                {isOnHold ? <Play className="w-3.5 h-3.5 fill-current" /> : <PauseCircle className="w-3.5 h-3.5" />}
                <span>{isOnHold ? 'Resume Chat (Unpause Timer)' : 'Hold Customer (Pause 2-Min SLA)'}</span>
              </button>
            </div>

            {/* Live Impact Event Log */}
            <div className="flex-1 flex flex-col min-h-0 border-t border-line pt-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5"><History className="w-3.5 h-3.5 text-warn" /> Live Impact Audit</span>
                <span className="text-[10px] font-mono text-ink-4">{eventLog.length} events</span>
              </h3>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-[11px] min-h-0 custom-scrollbar">
                {eventLog.map((ev) => (
                  <div 
                    key={ev.id} 
                    className={`p-2 rounded border flex items-start justify-between gap-2 ${
                      ev.delta > 0 ? 'bg-ok/10 border-ok/30 text-ok' :
                      ev.delta < 0 ? 'bg-danger/10 border-danger/30 text-danger' :
                      'bg-surface/60 border-line text-ink-2'
                    }`}
                  >
                    <div>
                      <p className="font-medium leading-tight">{ev.label}</p>
                      <span className="text-[9px] text-ink-3 font-mono">{ev.timestamp}</span>
                    </div>
                    {ev.delta !== 0 && (
                      <span className={`font-mono font-black text-xs px-1.5 py-0.5 rounded ${
                        ev.delta > 0 ? 'bg-ok/15 text-ok' : 'bg-danger/15 text-danger'
                      }`}>
                        {ev.delta > 0 ? `+${ev.delta}` : ev.delta}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* CENTER PANEL: Live Chat Workspace */}
          <div className={`lg:col-span-6 ${activePane === 'chat' ? 'flex' : 'hidden'} lg:flex flex-col bg-surface lg:border-r border-line relative min-h-0`}>
            <div className="bg-surface-2/40 border-b border-line px-3 sm:px-4 py-2 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full bg-ok animate-pulse shrink-0"></div>
                <span className="text-xs font-bold text-ink truncate">Live Agent Workspace</span>
              </div>
              <span className="hidden sm:inline text-xs text-ink-3 font-mono shrink-0">Chat ID: #RY-{Math.floor(100000 + Math.random() * 900000)}</span>
            </div>

            <div ref={chatContainerRef} className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-3 min-h-0 custom-scrollbar">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === 'agent' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-3.5 sm:px-4 py-2.5 text-xs shadow-sm ${
                      msg.sender === 'agent'
                        ? msg.isHoldNotice
                          ? 'bg-warn/20 border border-warn/30 text-warn rounded-br-none'
                          : 'bg-brand text-on-brand rounded-br-none'
                        : msg.isSystemAlert
                        ? 'bg-danger/20 border border-danger text-danger rounded-bl-none'
                        : 'bg-surface-2 text-ink rounded-bl-none border border-line'
                    }`}
                  >
                    <div className={`flex items-center justify-between text-[10px] mb-1 font-semibold gap-3 ${
                      msg.sender === 'agent' && !msg.isHoldNotice ? 'text-on-brand/70' : 'text-ink-3'
                    }`}>
                      <span>{msg.sender === 'agent' ? 'You (Agent)' : selectedScenario.passenger}</span>
                      <span>{msg.timestamp}</span>
                    </div>
                    <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))}

              {isLoadingAi && (
                <div className="flex items-start">
                  <div className="bg-surface-2 text-ink-3 rounded-2xl px-4 py-3 text-xs border border-line flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-brand animate-bounce"></div>
                    <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0.2s]"></div>
                    <div className="w-2 h-2 rounded-full bg-brand animate-bounce [animation-delay:0.4s]"></div>
                    <span className="text-[10px] text-ink-3 ml-1">Customer is replying...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Macro Buttons */}
            <div className="bg-surface-2/30 border-t border-line p-2 flex items-center gap-2 overflow-x-auto text-[11px] shrink-0 custom-scrollbar">
              <span className="text-ink-4 font-semibold text-[10px] uppercase pl-1 shrink-0">Macros:</span>
              <button
                onClick={() => handleInsertCanned("Thank you for contacting Ryanair support. Allow me a moment to look into your booking details.")}
                className="bg-surface-2 hover:bg-surface-3 text-ink-2 px-2.5 py-1 rounded border border-line whitespace-nowrap"
              >
                Greeting
              </button>
              <button
                onClick={() => handleInsertCanned("As per Ryanair digital policy, minor name spelling corrections within 24 hours can be completed free of charge directly on the Ryanair app or website. Have you tried doing this through your account?")}
                className="bg-warn/10 hover:bg-warn/20 text-warn font-semibold px-2.5 py-1 rounded border border-warn/30 whitespace-nowrap transition"
              >
                Push Self-Service
              </button>
              <button
                onClick={() => handleInsertCanned("In order for us to process this change manually on our end, please provide a screenshot or proof of the error you encountered while attempting self-service on the website or app.")}
                className="bg-surface-2 hover:bg-surface-3 text-ink-2 px-2.5 py-1 rounded border border-line whitespace-nowrap"
              >
                Request Proof
              </button>
              <button
                onClick={() => handleInsertCanned("According to Ryanair baggage policy, small personal bags must fit within 40x20x25cm.")}
                className="bg-surface-2 hover:bg-surface-3 text-ink-2 px-2.5 py-1 rounded border border-line whitespace-nowrap"
              >
                Cabin Bag Rule
              </button>
            </div>

            {/* Input Composer (Shift+Enter for newline, Enter to send) */}
            <div className="p-2.5 sm:p-3 bg-surface-2/80 border-t border-line flex items-end sm:items-center gap-2 shrink-0">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                rows={2}
                placeholder={isOnHold ? "Customer is on hold. Type a message or click Resume..." : "Type response to customer... (Enter to send, Shift+Enter for newline)"}
                className="flex-1 min-w-0 bg-surface border border-line rounded-xl px-3 sm:px-4 py-2.5 text-xs text-ink placeholder-ink-4 focus:outline-none focus:border-brand transition resize-none"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputMessage.trim() || isLoadingAi}
                className="shrink-0 bg-brand hover:bg-brand-strong disabled:opacity-50 text-on-brand p-3 rounded-xl transition flex items-center justify-center shadow"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* RIGHT SIDEBAR: Ryanair Knowledge Base */}
          <div className={`lg:col-span-3 ${activePane === 'policy' ? 'flex' : 'hidden'} lg:flex bg-surface-2/60 lg:border-l border-line p-3 sm:p-4 flex-col gap-3 overflow-hidden min-h-0`}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-warn" /> Ryanair SOP Search
              </h3>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-ink-3" />
              <input
                type="text"
                placeholder="Search policy (e.g., baggage, fee, delay)..."
                value={sopSearch}
                onChange={(e) => setSopSearch(e.target.value)}
                className="w-full bg-surface border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink placeholder-ink-4 focus:outline-none focus:border-warn"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
              {filteredSop.map((sop, idx) => (
                <div key={idx} className="bg-surface/90 border border-line/80 rounded-lg p-3 text-xs space-y-1 hover:border-warn/50 transition">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-warn uppercase tracking-wide">{sop.category}</span>
                  </div>
                  <h4 className="font-bold text-ink">{sop.title}</h4>
                  <p className="text-[11px] text-ink-3 leading-relaxed">{sop.content}</p>
                </div>
              ))}
              {filteredSop.length === 0 && (
                <p className="text-xs text-ink-4 text-center py-4">No matching Ryanair policy found.</p>
              )}
            </div>
          </div>
          </div>
        </div>
      )}

      {}
      {appState === 'scorecard' && (
        <div className="flex-1 min-h-0 w-full max-w-4xl mx-auto p-3 sm:p-6 overflow-y-auto custom-scrollbar">
          {isEvaluating ? (
            <div className="text-center py-12 space-y-4">
              <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto"></div>
              <h3 className="text-xl font-bold text-ink">Consolidating Connected KPI Audit & AI Policy Evaluation...</h3>
              <p className="text-xs text-ink-3">Analyzing total handling time, typing velocity, live quality score, and Ryanair digital policy compliance.</p>
            </div>
          ) : scorecard ? (
            <div className="bg-surface-2/80 border border-line rounded-2xl p-4 sm:p-6 shadow-2xl space-y-5 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-5">
                <div>
                  <span className="text-xs font-bold text-brand uppercase tracking-widest">Performance Evaluation Scorecard</span>
                  <h2 className="text-2xl font-black text-ink mt-0.5">Session Resolution Audit</h2>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <p className="text-[10px] text-ink-3 uppercase">Overall Grade</p>
                    <p className="text-xs font-semibold text-ink-2">Ryanair CS Standard</p>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-brand to-brand-strong rounded-xl flex items-center justify-center font-black text-2xl text-warn shadow-lg border border-brand/30">
                    {scorecard.grade}
                  </div>
                </div>
              </div>

              {/* Connected Performance Score Banner */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-surface/90 p-3.5 rounded-xl border border-line text-center">
                  <p className="text-[10px] text-ink-3 font-medium uppercase">Accumulated Quality Score</p>
                  <p className={`text-2xl font-black mt-1 ${scorecard.finalLiveScore >= 80 ? 'text-ok' : 'text-warn'}`}>
                    {scorecard.finalLiveScore}%
                  </p>
                </div>
                <div className="bg-surface/90 p-3.5 rounded-xl border border-line text-center">
                  <p className="text-[10px] text-ink-3 font-medium uppercase">SOP Policy Accuracy</p>
                  <p className="text-2xl font-black text-ok mt-1">{scorecard.sopAccuracy}%</p>
                </div>
                <div className="bg-surface/90 p-3.5 rounded-xl border border-line text-center">
                  <p className="text-[10px] text-ink-3 font-medium uppercase">Communication & Tone</p>
                  <p className="text-2xl font-black text-brand mt-1">{scorecard.communicationScore}%</p>
                </div>
                <div className="bg-surface/90 p-3.5 rounded-xl border border-line text-center">
                  <p className="text-[10px] text-ink-3 font-medium uppercase">SLA & Timing</p>
                  <p className={`text-2xl font-black mt-1 ${scorecard.violations === 0 ? 'text-ok' : 'text-danger'}`}>
                    {scorecard.timeSlaScore}%
                  </p>
                </div>
              </div>

              {/* Operational Telemetry Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface/50 p-3 rounded-xl text-xs text-ink-2">
                <div>
                  <span className="text-ink-4 block text-[10px]">Total Handling Time:</span>
                  <span className="font-mono font-bold">{scorecard.handlingTime}</span>
                </div>
                <div>
                  <span className="text-ink-4 block text-[10px]">Typing Velocity:</span>
                  <span className="font-mono font-bold text-brand">{scorecard.wpm} WPM</span>
                </div>
                <div>
                  <span className="text-ink-4 block text-[10px]">2-Min Violations:</span>
                  <span className={`font-mono font-bold ${scorecard.violations > 0 ? 'text-danger' : 'text-ok'}`}>
                    {scorecard.violations}
                  </span>
                </div>
                <div>
                  <span className="text-ink-4 block text-[10px]">Customer Holds:</span>
                  <span className="font-mono font-bold">{scorecard.holds}</span>
                </div>
              </div>

              <div className="bg-surface/80 p-4 rounded-xl border border-line space-y-2">
                <h4 className="text-xs font-bold text-warn uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="w-4 h-4" /> Operations Audit Summary
                </h4>
                <p className="text-xs text-ink-2 leading-relaxed">{scorecard.summary}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="bg-ok/10 border border-ok/30 p-4 rounded-xl space-y-2">
                  <h4 className="font-bold text-ok flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4" /> Key Strengths
                  </h4>
                  <ul className="space-y-1 text-ink-2 list-disc list-inside">
                    {scorecard.strengths?.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div className="bg-warn/10 border border-warn/30 p-4 rounded-xl space-y-2">
                  <h4 className="font-bold text-warn flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" /> Areas to Improve
                  </h4>
                  <ul className="space-y-1 text-ink-2 list-disc list-inside">
                    {scorecard.improvements?.map((imp, i) => (
                      <li key={i}>{imp}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-center justify-stretch sm:justify-end pt-3">
                <button
                  onClick={() => setAppState('setup')}
                  className="w-full sm:w-auto justify-center bg-surface-3 hover:bg-surface-3 text-ink font-semibold px-5 py-2.5 rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Start New Simulation</span>
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}