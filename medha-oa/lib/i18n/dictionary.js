// lib/i18n/dictionary.js
//
// Translation coverage note (read before adding a language):
// English and Hindi are translated in full below, including the long
// clinical questionnaire text (WOMAC/FIHOA items) — Hindi medical
// terminology here is common enough to be reasonably confident in.
// Assamese and Nagamese are translated for all interface chrome
// (navigation, buttons, step titles, instructions) but the long
// questionnaire item lists intentionally fall back to English, flagged
// with `questionnaireFallback: true` below. This is a deliberate safety
// choice: incorrect medical-question translation is worse than none.
// Before a real NER deployment, have a native clinical translator
// review and fill in `womacQuestions` / `fihoaQuestions` for "as" and
// "nag" — the keys are already there, just empty.

export const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "as", label: "Assamese", native: "অসমীয়া" },
  { code: "nag", label: "Nagamese", native: "Nagamese" },
];

const en = {
  questionnaireFallback: false,
  nav: { dashboard: "Dashboard", patients: "Patients", settings: "Settings", signOut: "Sign out" },
  common: {
    save: "Save & Continue", back: "Back", next: "Next", start: "Start", stop: "Stop",
    skip: "Skip", loading: "Loading…", search: "Search", cancel: "Cancel",
  },
  auth: {
    appName: "SANDHIQ", tagline: "AI-Assisted Osteoarthritis Screening Platform",
    loginTitle: "Health Worker Login", loginSubtitle: "Sign in to access patient screening on this device.",
    username: "Username", password: "Password", signIn: "Sign in", signingIn: "Signing in…",
    noAccount: "New health worker on this device?", createAccount: "Create an account",
    signupTitle: "New Account", signupSubtitle: "Accounts are stored on this device only, so the app works fully offline.",
    fullName: "Full name", role: "Role", createBtn: "Create account", creating: "Creating account…",
    haveAccount: "Already have an account?",
  },
  dashboard: {
    title: "Dashboard", subtitle: "Overview of screening activity on this device", newPatient: "New Patient",
    patients: "Registered Patients", completed: "Screenings Completed", inProgress: "In Progress", highRisk: "High-Risk Flags",
    recent: "Recent Screenings", riskDistribution: "Risk Distribution", noScreenings: "No screenings yet. Add a patient to begin.",
  },
  patients: {
    title: "Patients", newPatient: "New Patient", searchPlaceholder: "Search by name, code, phone, or village…",
    none: "No patients found.", registerTitle: "Register New Patient", registerSubtitle: "Basic details for a new screening record",
    name: "Full name", age: "Age", sex: "Sex", phone: "Phone (optional)", village: "Village / Area",
    height: "Height (cm, optional)", weight: "Weight (kg, optional)", registerBtn: "Register Patient",
    startScreening: "Start New Screening", history: "Screening History", trend: "Risk Score Trend", noHistory: "No screenings yet for this patient.",
  },
  settings: {
    title: "Settings", subtitle: "Device, language, and data management", language: "Interface Language",
    languageNote: "Choose the interface language for this device.",
    about: "About This Device",
    aboutText: "All patient data, screenings, and accounts are stored locally in this browser's storage. Nothing is sent to a server — the app works fully offline.",
    danger: "Danger Zone", dangerText: "Permanently erase all data stored on this device.", wipe: "Wipe all local data",
  },
  steps: {
    womacTitle: "WOMAC Questionnaire — Knee / Hip",
    womacSubtitle: "Ask the patient about pain, stiffness, and daily function.",
    fihoaTitle: "FIHOA — Hand Function Questionnaire",
    fihoaSubtitle: "Ask about difficulty performing everyday hand tasks.",
    handTitle: "Hand Visual / Nodal Assessment",
    handSubtitle: "Compare the patient's hands against the reference photographs.",
    gripTitle: "Pull Force — Rope-Pull Tension Test",
    gripSubtitle: "Measures functional impact of hand/thumb-base OA from peak rope-pull force.",
    imuTitle: "IMU — Joint Movement / Vibroarthrography",
    imuSubtitle: "Bilateral shin+thigh IMU capturing vibration during active knee movement.",
    cvTitle: "Camera-Based Functional Assessment",
    cvSubtitle: "Chair-stand, gait, TUG, knee ROM, and balance — via real-time pose tracking.",
    xrayTitle: "Knee X-ray (if available)",
    xraySubtitle: "Optional — the fusion engine automatically re-weights other tests when unavailable.",
    reviewTitle: "Combined Risk Analysis",
    reviewSubtitle: "Multimodal fusion across every completed test.",
    questionOf: "Question {n} of {total}",
    testOf: "Test {n} of {total}",
  },
};

const hi = {
  questionnaireFallback: false,
  nav: { dashboard: "डैशबोर्ड", patients: "मरीज़", settings: "सेटिंग्स", signOut: "साइन आउट" },
  common: {
    save: "सहेजें और जारी रखें", back: "पीछे", next: "अगला", start: "शुरू करें", stop: "रोकें",
    skip: "छोड़ें", loading: "लोड हो रहा है…", search: "खोजें", cancel: "रद्द करें",
  },
  auth: {
    appName: "SANDHIQ", tagline: "एआई-सहायित ऑस्टियोआर्थराइटिस स्क्रीनिंग प्लेटफ़ॉर्म",
    loginTitle: "स्वास्थ्य कार्यकर्ता लॉगिन", loginSubtitle: "इस डिवाइस पर मरीज़ स्क्रीनिंग के लिए साइन इन करें।",
    username: "उपयोगकर्ता नाम", password: "पासवर्ड", signIn: "साइन इन करें", signingIn: "साइन इन हो रहा है…",
    noAccount: "इस डिवाइस पर नए स्वास्थ्य कार्यकर्ता?", createAccount: "खाता बनाएं",
    signupTitle: "नया खाता", signupSubtitle: "खाते केवल इस डिवाइस पर सहेजे जाते हैं, इसलिए ऐप पूरी तरह ऑफ़लाइन काम करता है।",
    fullName: "पूरा नाम", role: "भूमिका", createBtn: "खाता बनाएं", creating: "खाता बन रहा है…",
    haveAccount: "पहले से खाता है?",
  },
  dashboard: {
    title: "डैशबोर्ड", subtitle: "इस डिवाइस पर स्क्रीनिंग गतिविधि का अवलोकन", newPatient: "नया मरीज़",
    patients: "पंजीकृत मरीज़", completed: "पूर्ण स्क्रीनिंग", inProgress: "प्रगति में", highRisk: "उच्च-जोखिम मामले",
    recent: "हाल की स्क्रीनिंग", riskDistribution: "जोखिम वितरण", noScreenings: "अभी तक कोई स्क्रीनिंग नहीं। शुरू करने के लिए एक मरीज़ जोड़ें।",
  },
  patients: {
    title: "मरीज़", newPatient: "नया मरीज़", searchPlaceholder: "नाम, कोड, फ़ोन, या गाँव से खोजें…",
    none: "कोई मरीज़ नहीं मिला।", registerTitle: "नया मरीज़ पंजीकृत करें", registerSubtitle: "नई स्क्रीनिंग रिकॉर्ड के लिए बुनियादी विवरण",
    name: "पूरा नाम", age: "आयु", sex: "लिंग", phone: "फ़ोन (वैकल्पिक)", village: "गाँव / क्षेत्र",
    height: "ऊंचाई (सेमी, वैकल्पिक)", weight: "वज़न (किग्रा, वैकल्पिक)", registerBtn: "मरीज़ पंजीकृत करें",
    startScreening: "नई स्क्रीनिंग शुरू करें", history: "स्क्रीनिंग इतिहास", trend: "जोखिम स्कोर रुझान", noHistory: "इस मरीज़ के लिए अभी तक कोई स्क्रीनिंग नहीं।",
  },
  settings: {
    title: "सेटिंग्स", subtitle: "डिवाइस, भाषा, और डेटा प्रबंधन", language: "इंटरफ़ेस भाषा",
    languageNote: "इस डिवाइस के लिए इंटरफ़ेस भाषा चुनें।",
    about: "इस डिवाइस के बारे में",
    aboutText: "सभी मरीज़ डेटा, स्क्रीनिंग, और खाते इस ब्राउज़र में स्थानीय रूप से संग्रहीत हैं। कुछ भी सर्वर पर नहीं भेजा जाता — ऐप पूरी तरह ऑफ़लाइन काम करता है।",
    danger: "खतरा क्षेत्र", dangerText: "इस डिवाइस पर संग्रहीत सभी डेटा स्थायी रूप से मिटाएं।", wipe: "सभी स्थानीय डेटा मिटाएं",
  },
  steps: {
    womacTitle: "WOMAC प्रश्नावली — घुटना / कूल्हा",
    womacSubtitle: "मरीज़ से दर्द, अकड़न, और दैनिक कार्य के बारे में पूछें।",
    fihoaTitle: "FIHOA — हाथ कार्य प्रश्नावली",
    fihoaSubtitle: "रोज़मर्रा के हाथ के कार्यों में कठिनाई के बारे में पूछें।",
    handTitle: "हाथ का दृश्य / नोड्यूल मूल्यांकन",
    handSubtitle: "मरीज़ के हाथों की तुलना संदर्भ चित्रों से करें।",
    gripTitle: "खिंचाव बल — रस्सी-खिंचाव तनाव परीक्षण",
    gripSubtitle: "हाथ/अंगूठे के आधार OA के कार्यात्मक प्रभाव को अधिकतम रस्सी-खिंचाव बल से मापता है।",
    imuTitle: "IMU — जोड़ गति / वाइब्रोआर्थ्रोग्राफी",
    imuSubtitle: "सक्रिय घुटने की गति के दौरान कंपन को कैप्चर करने वाला द्विपक्षीय IMU।",
    cvTitle: "कैमरा-आधारित कार्यात्मक मूल्यांकन",
    cvSubtitle: "चेयर-स्टैंड, चाल, TUG, घुटना ROM, और संतुलन — रीयल-टाइम पोज़ ट्रैकिंग के माध्यम से।",
    xrayTitle: "घुटने का एक्स-रे (यदि उपलब्ध हो)",
    xraySubtitle: "वैकल्पिक — उपलब्ध न होने पर फ्यूज़न इंजन अन्य परीक्षणों का वज़न स्वतः समायोजित करता है।",
    reviewTitle: "संयुक्त जोखिम विश्लेषण",
    reviewSubtitle: "हर पूर्ण परीक्षण में मल्टीमॉडल फ्यूज़न।",
    questionOf: "प्रश्न {n} / {total}",
    testOf: "परीक्षण {n} / {total}",
  },
};

// Assamese & Nagamese: interface chrome translated; long questionnaire
// item arrays intentionally left for a native clinical reviewer (see
// note at top of file) — UI falls back to English for those specific lists.
const as = {
  questionnaireFallback: true,
  nav: { dashboard: "ডেশ্ববৰ্ড", patients: "ৰোগী", settings: "ছেটিংছ", signOut: "ছাইন আউট" },
  common: {
    save: "ছেভ কৰক আৰু আগবাঢ়ক", back: "উভতি যাওক", next: "পিছৰ", start: "আৰম্ভ কৰক", stop: "বন্ধ কৰক",
    skip: "এৰি যাওক", loading: "লোড হৈ আছে…", search: "সন্ধান কৰক", cancel: "বাতিল কৰক",
  },
  auth: {
    appName: "SANDHIQ", tagline: "AI-সহায়ক অষ্টিঅ্যাৰথ্ৰাইটিছ স্ক্ৰীনিং প্লেটফৰ্ম",
    loginTitle: "স্বাস্থ্যকৰ্মী লগইন", loginSubtitle: "এই ডিভাইচত ৰোগী স্ক্ৰীনিং কৰিবলৈ ছাইন ইন কৰক।",
    username: "ব্যৱহাৰকাৰীৰ নাম", password: "পাছৱৰ্ড", signIn: "ছাইন ইন", signingIn: "ছাইন ইন হৈ আছে…",
    noAccount: "এই ডিভাইচত নতুন স্বাস্থ্যকৰ্মী?", createAccount: "একাউণ্ট সৃষ্টি কৰক",
    signupTitle: "নতুন একাউণ্ট", signupSubtitle: "একাউণ্ট কেৱল এই ডিভাইচতে থাকে, সেয়ে এপটো সম্পূৰ্ণ অফলাইনত কাম কৰে।",
    fullName: "সম্পূৰ্ণ নাম", role: "ভূমিকা", createBtn: "একাউণ্ট সৃষ্টি কৰক", creating: "একাউণ্ট সৃষ্টি হৈ আছে…",
    haveAccount: "ইতিমধ্যে একাউণ্ট আছে?",
  },
  dashboard: {
    title: "ডেশ্ববৰ্ড", subtitle: "এই ডিভাইচৰ স্ক্ৰীনিং কাৰ্যকলাপৰ সাৰাংশ", newPatient: "নতুন ৰোগী",
    patients: "পঞ্জীভুক্ত ৰোগী", completed: "সম্পূৰ্ণ স্ক্ৰীনিং", inProgress: "চলি থকা", highRisk: "উচ্চ-জোখিম",
    recent: "শেহতীয়া স্ক্ৰীনিং", riskDistribution: "জোখিম বিতৰণ", noScreenings: "এতিয়ালৈকে কোনো স্ক্ৰীনিং নাই।",
  },
  patients: {
    title: "ৰোগী", newPatient: "নতুন ৰোগী", searchPlaceholder: "নাম, কোড, ফোন বা গাঁৱেৰে সন্ধান কৰক…",
    none: "কোনো ৰোগী পোৱা নগ'ল।", registerTitle: "নতুন ৰোগী পঞ্জীয়ন কৰক", registerSubtitle: "নতুন স্ক্ৰীনিং ৰেকৰ্ডৰ বাবে মৌলিক তথ্য",
    name: "সম্পূৰ্ণ নাম", age: "বয়স", sex: "লিংগ", phone: "ফোন (ঐচ্ছিক)", village: "গাঁও / অঞ্চল",
    height: "উচ্চতা (চে.মি., ঐচ্ছিক)", weight: "ওজন (কে.জি., ঐচ্ছিক)", registerBtn: "ৰোগী পঞ্জীয়ন কৰক",
    startScreening: "নতুন স্ক্ৰীনিং আৰম্ভ কৰক", history: "স্ক্ৰীনিং ইতিহাস", trend: "জোখিম স্ক'ৰৰ ধাৰা", noHistory: "এই ৰোগীৰ বাবে এতিয়ালৈকে কোনো স্ক্ৰীনিং নাই।",
  },
  settings: {
    title: "ছেটিংছ", subtitle: "ডিভাইচ, ভাষা, আৰু ডাটা ব্যৱস্থাপনা", language: "ইণ্টাৰফেচ ভাষা",
    languageNote: "এই ডিভাইচৰ বাবে ইণ্টাৰফেচ ভাষা বাছনি কৰক।",
    about: "এই ডিভাইচৰ বিষয়ে",
    aboutText: "সকলো ৰোগীৰ ডাটা, স্ক্ৰীনিং, আৰু একাউণ্ট এই ব্ৰাউজাৰত স্থানীয়ভাৱে ষ্ট'ৰ কৰা হয়। কোনো ছাৰ্ভাৰলৈ একো নপঠিওৱা হয়।",
    danger: "বিপদ অঞ্চল", dangerText: "এই ডিভাইচত থকা সকলো ডাটা স্থায়ীভাৱে মচক।", wipe: "সকলো স্থানীয় ডাটা মচক",
  },
  steps: {
    womacTitle: "WOMAC প্ৰশ্নাৱলী — আঁঠু / কঁকাল",
    womacSubtitle: "ৰোগীক বিষ, টান লগা, আৰু দৈনন্দিন কামৰ বিষয়ে সোধক।",
    fihoaTitle: "FIHOA — হাতৰ কাৰ্য্য প্ৰশ্নাৱলী",
    fihoaSubtitle: "দৈনন্দিন হাতৰ কামত অসুবিধাৰ বিষয়ে সোধক।",
    handTitle: "হাতৰ দৃশ্যমান মূল্যায়ন",
    handSubtitle: "ৰোগীৰ হাত সন্দৰ্ভ ছবিৰ সৈতে তুলনা কৰক।",
    gripTitle: "টেহতি শক্তি — দৈ ৰপ-টেহতি টেনশন পৰীক্ষা",
    gripSubtitle: "হাত/বুঠৰ মূলৰ OAৰ কাৰ্যক্ষম প্ৰভাৱ অধিকতম দৈ-টেহতিৰ শক্তিৰে জোখা হয়।",
    imuTitle: "IMU — গাঁঠি গতি বিশ্লেষণ",
    imuSubtitle: "আঁঠুৰ সক্ৰিয় গতিৰ সময়ত কম্পন কেপচাৰ কৰা IMU।",
    cvTitle: "কেমেৰা-ভিত্তিক কাৰ্য্যক্ষম মূল্যায়ন",
    cvSubtitle: "চেয়াৰ-ষ্টেণ্ড, গেইট, TUG, আঁঠু ROM, আৰু সন্তুলন।",
    xrayTitle: "আঁঠুৰ এক্স-ৰে (উপলব্ধ থাকিলে)",
    xraySubtitle: "ঐচ্ছিক — উপলব্ধ নহ'লে ফিউজন ইঞ্জিনে অন্য পৰীক্ষাৰ ওজন সলনি কৰে।",
    reviewTitle: "সংযুক্ত জোখিম বিশ্লেষণ",
    reviewSubtitle: "সকলো সম্পূৰ্ণ পৰীক্ষাৰ মাজত মাল্টিমডেল ফিউজন।",
    questionOf: "প্ৰশ্ন {n} / {total}",
    testOf: "পৰীক্ষা {n} / {total}",
  },
};

const nag = {
  questionnaireFallback: true,
  nav: { dashboard: "Dashboard", patients: "Patient", settings: "Setting", signOut: "Sign out" },
  common: {
    save: "Save kori age jabo", back: "Pichot jabo", next: "Age", start: "Suru koribi", stop: "Bondo koribi",
    skip: "Chari dibi", loading: "Load hoi ase…", search: "Bisari sabi", cancel: "Cancel koribi",
  },
  auth: {
    appName: "SANDHIQ", tagline: "AI-loi modot kora Osteoarthritis screening platform",
    loginTitle: "Health worker login", loginSubtitle: "Ei device te patient screening koribole sign in koribi.",
    username: "Username", password: "Password", signIn: "Sign in koribi", signingIn: "Sign in hoi ase…",
    noAccount: "Ei device te notun health worker?", createAccount: "Account bonabi",
    signupTitle: "Notun account", signupSubtitle: "Account khan ei device tei thake, tai app pura offline te kaam kore.",
    fullName: "Pura naam", role: "Role", createBtn: "Account bonabi", creating: "Account bonai ase…",
    haveAccount: "Age te account ase?",
  },
  dashboard: {
    title: "Dashboard", subtitle: "Ei device te screening kaam laga overview", newPatient: "Notun patient",
    patients: "Register kora patient", completed: "Screening complete", inProgress: "Cholise",
    highRisk: "High-risk case", recent: "Notun screening khan", riskDistribution: "Risk laga distribution",
    noScreenings: "Etiya tak kunu screening nai.",
  },
  patients: {
    title: "Patient", newPatient: "Notun patient", searchPlaceholder: "Naam, code, phone, arau village pora bisari sabi…",
    none: "Kunu patient napaise.", registerTitle: "Notun patient register koribi", registerSubtitle: "Notun screening record laga basic details",
    name: "Pura naam", age: "Bosor", sex: "Sex", phone: "Phone (optional)", village: "Village / Elaka",
    height: "Height (cm, optional)", weight: "Weight (kg, optional)", registerBtn: "Patient register koribi",
    startScreening: "Notun screening suru koribi", history: "Screening history", trend: "Risk score laga trend",
    noHistory: "Ei patient laga etiya tak kunu screening nai.",
  },
  settings: {
    title: "Setting", subtitle: "Device, bhasha, arau data management", language: "Interface bhasha",
    languageNote: "Ei device laga interface bhasha basi lobi.",
    about: "Ei device laga bisoi te",
    aboutText: "Sob patient data, screening, arau account ei browser tei local te thake. Kunu server te napothai.",
    danger: "Danger zone", dangerText: "Ei device tei thaka sob data permanent te mochi dibi.", wipe: "Sob local data mochi dibi",
  },
  steps: {
    womacTitle: "WOMAC Questionnaire — Athu / Komor",
    womacSubtitle: "Patient ke pain, stiffness, arau daily function laga bisoi te hudi bi.",
    fihoaTitle: "FIHOA — Hath laga function questionnaire",
    fihoaSubtitle: "Daily hath laga kaam te asubidha laga bisoi te hudi bi.",
    handTitle: "Hath visual assessment",
    handSubtitle: "Patient laga hath reference image logote compare koribi.",
    gripTitle: "Dhere force — Rope dhere tension pariksha",
    gripSubtitle: "Hath/muthi kar base r OA functional impact maximum rope dhere force di mApu hoye.",
    imuTitle: "IMU — Joint movement analysis",
    imuSubtitle: "Athu laga active movement te vibration capture kora IMU.",
    cvTitle: "Camera-based functional assessment",
    cvSubtitle: "Chair-stand, gait, TUG, knee ROM, arau balance.",
    xrayTitle: "Athu laga X-ray (thakile)",
    xraySubtitle: "Optional — nathakile fusion engine dusra test khan laga weight change kore.",
    reviewTitle: "Combined risk analysis",
    reviewSubtitle: "Sob complete test laga multimodal fusion.",
    questionOf: "Question {n} / {total}",
    testOf: "Test {n} / {total}",
  },
};

const assistant = {
  en: { name: "SANDHIQ Assistant", subtitle: "Local clinical guide", greeting: "Ask about using SANDHIQ or general osteoarthritis education.", unavailable: "The AI assistant is not running on this device.", setup: "Start Ollama, then try again. See AI_ASSISTANT_SETUP.md.", thinking: "Thinking…", placeholder: "Type your question…", offline: "Offline AI — powered by Ollama on this device", voiceHint: "Voice input is available in Hindi and English.", send: "Send", open: "Open assistant", close: "Close assistant", speak: "Read aloud", mute: "Mute assistant voice", unmute: "Unmute assistant voice" },
  hi: { name: "SANDHIQ सहायक", subtitle: "स्थानीय क्लिनिकल मार्गदर्शक", greeting: "SANDHIQ के उपयोग या ऑस्टियोआर्थराइटिस की सामान्य जानकारी के बारे में पूछें।", unavailable: "इस डिवाइस पर AI सहायक चालू नहीं है।", setup: "Ollama शुरू करें और फिर प्रयास करें। AI_ASSISTANT_SETUP.md देखें।", thinking: "सोच रहा है…", placeholder: "अपना प्रश्न लिखें…", offline: "ऑफ़लाइन AI — इस डिवाइस पर Ollama द्वारा संचालित", voiceHint: "आवाज़ इनपुट हिंदी और अंग्रेज़ी में उपलब्ध है।", send: "भेजें", open: "सहायक खोलें", close: "सहायक बंद करें", speak: "जोर से पढ़ें", mute: "सहायक की आवाज़ म्यूट करें", unmute: "सहायक की आवाज़ चालू करें" },
  as: { name: "SANDHIQ সহায়ক", subtitle: "স্থানীয় ক্লিনিকেল সহায়ক", greeting: "SANDHIQ ব্যৱহাৰ বা Osteoarthritisৰ সাধাৰণ তথ্যৰ বিষয়ে সোধক।", unavailable: "এই ডিভাইচত AI সহায়ক চলি থকা নাই।", setup: "Ollama আৰম্ভ কৰি পুনৰ চেষ্টা কৰক। AI_ASSISTANT_SETUP.md চাওক।", thinking: "ভাবি আছে…", placeholder: "আপোনাৰ প্ৰশ্ন লিখক…", offline: "অফলাইন AI — এই ডিভাইচত Ollama দ্বাৰা চলিত", voiceHint: "ভইচ ইনপুট হিন্দী আৰু ইংৰাজীত উপলব্ধ।", send: "পঠিয়াওক", open: "সহায়ক খোলক", close: "সহায়ক বন্ধ কৰক", speak: "শব্দ কৰি পঢ়ক", mute: "সহায়কৰ মাত বন্ধ কৰক", unmute: "সহায়কৰ মাত চলাওক" },
  nag: { name: "SANDHIQ Assistant", subtitle: "Local clinical help", greeting: "SANDHIQ keneke use koribi ba osteoarthritis laga general bisoi te hudi sabi.", unavailable: "Ei device te AI assistant chali nai.", setup: "Ollama suru kori akou try koribi. AI_ASSISTANT_SETUP.md sabi.", thinking: "Bhabi ase…", placeholder: "Apon laga question likhibi…", offline: "Offline AI — ei device te Ollama pora chali ase", voiceHint: "Voice input Hindi aru English te available ase.", send: "Pothabi", open: "Assistant khulibi", close: "Assistant bondo koribi", speak: "Jore porhibi", mute: "Assistant laga awaj bondo koribi", unmute: "Assistant laga awaj chalu koribi" },
};
const report = {
  en: { back: "Back to", print: "Print / Save PDF", title: "SANDHIQ Screening Report", generated: "Generated", patient: "Patient", patientId: "Patient ID", ageSex: "Age / Sex", village: "Village", impression: "Overall Screening Impression", risk: "Risk", womac: "WOMAC Subscale Breakdown", findings: "Contributing Findings", notCompleted: "Not completed", guidance: "Preventive Guidance", disclaimer: "This is a preliminary AI-assisted screening tool, not a diagnostic device. Please consult an orthopaedic specialist for confirmatory evaluation. Weights and thresholds are pending clinical validation.", joint: "Joint Care", jointText: "Avoid prolonged squatting or floor-sitting. Use a chair or stool for daily tasks where possible.", activity: "Physical Activity", activityText: "Gentle range-of-motion and low-impact exercise such as walking, cycling, or swimming for 20–30 minutes most days.", nutrition: "Nutrition", nutritionText: "Maintain a healthy body weight; every kilogram of weight loss meaningfully reduces load on the knee joint.", doctor: "When to See a Doctor", doctorText: "Persistent swelling, night pain, or rapidly worsening function warrants a clinician visit." },
  hi: { back: "वापस जाएं", print: "प्रिंट / PDF सहेजें", title: "SANDHIQ स्क्रीनिंग रिपोर्ट", generated: "बनाया गया", patient: "मरीज़", patientId: "मरीज़ आईडी", ageSex: "आयु / लिंग", village: "गाँव", impression: "समग्र स्क्रीनिंग निष्कर्ष", risk: "जोखिम", womac: "WOMAC उप-स्केल विवरण", findings: "योगदान करने वाले निष्कर्ष", notCompleted: "पूरा नहीं हुआ", guidance: "बचाव संबंधी मार्गदर्शन", disclaimer: "यह एक प्रारंभिक AI-सहायित स्क्रीनिंग उपकरण है, निदान उपकरण नहीं। पुष्टिकरण मूल्यांकन के लिए ऑर्थोपेडिक विशेषज्ञ से परामर्श करें। भार और सीमाओं का नैदानिक सत्यापन लंबित है।", joint: "जोड़ों की देखभाल", jointText: "लंबे समय तक उकड़ू बैठने या ज़मीन पर बैठने से बचें। जहाँ संभव हो दैनिक कार्यों के लिए कुर्सी का उपयोग करें।", activity: "शारीरिक गतिविधि", activityText: "अधिकांश दिनों में 20–30 मिनट हल्के गति-अभ्यास और कम प्रभाव वाले व्यायाम करें।", nutrition: "पोषण", nutritionText: "स्वस्थ शरीर का वज़न बनाए रखें; वज़न कम करने से घुटने के जोड़ पर भार घटता है।", doctor: "डॉक्टर से कब मिलें", doctorText: "लगातार सूजन, रात में दर्द या कार्यक्षमता में तेज़ गिरावट होने पर चिकित्सक से मिलें।" },
  as: { back: "উভতি যাওক", print: "প্ৰিণ্ট / PDF সংৰক্ষণ", title: "SANDHIQ স্ক্ৰীনিং ৰিপোৰ্ট", generated: "তৈয়াৰ কৰা", patient: "ৰোগী", patientId: "ৰোগী ID", ageSex: "বয়স / লিংগ", village: "গাঁও", impression: "সামগ্ৰিক স্ক্ৰীনিং ফলাফল", risk: "জোখিম", womac: "WOMAC উপ-স্কেল", findings: "সহায়ক ফলাফল", notCompleted: "সম্পূৰ্ণ হোৱা নাই", guidance: "প্ৰতিৰোধমূলক পৰামৰ্শ", disclaimer: "এইটো প্ৰাথমিক AI-সহায়ক স্ক্ৰীনিং সঁজুলি, ৰোগ নিৰ্ণয়ৰ সঁজুলি নহয়। নিশ্চিত পৰীক্ষাৰ বাবে orthopaedic বিশেষজ্ঞৰ পৰামৰ্শ লওক।", joint: "গাঁঠিৰ যত্ন", jointText: "দীৰ্ঘ সময় আঁঠু মুদি বা মাটিত বহি নাথাকিব। সম্ভৱ হ’লে চকী ব্যৱহাৰ কৰক।", activity: "শাৰীৰিক কাৰ্যকলাপ", activityText: "বেছিভাগ দিন ২০–৩০ মিনিট কোমল গতিৰ ব্যায়াম বা কম-প্ৰভাৱৰ ব্যায়াম কৰক।", nutrition: "পুষ্টি", nutritionText: "স্বাস্থ্যকৰ শৰীৰৰ ওজন বজাই ৰাখক।", doctor: "কেতিয়া ডাক্তৰক দেখুৱাব", doctorText: "ধাৰাবাহিক ফুলি উঠা, ৰাতিৰ বিষ বা কাম কৰাৰ ক্ষমতা দ্ৰুত কমিলে চিকিৎসকৰ কাষ চাপক।" },
  nag: { back: "Pichot jabo", print: "Print / PDF save koribi", title: "SANDHIQ Screening Report", generated: "Bonai ase", patient: "Patient", patientId: "Patient ID", ageSex: "Bosor / Sex", village: "Village", impression: "Sob screening laga result", risk: "Risk", womac: "WOMAC sub-scale detail", findings: "Contributing finding khan", notCompleted: "Complete hua nai", guidance: "Bachibole advice", disclaimer: "Ei tu preliminary AI-assisted screening tool, diagnosis tool nohoi. Confirm koribole orthopaedic specialist ke dekhaibi.", joint: "Joint care", jointText: "Besi somoi athu muri ba mati te bohi nathakibi. Jodi paribi chair use koribi.", activity: "Physical activity", activityText: "Besi din 20–30 minute halka movement aru low-impact exercise koribi.", nutrition: "Nutrition", nutritionText: "Healthy body weight rakhibi.", doctor: "Doctor ke ketiya dekhaibi", doctorText: "Besi somoi swelling, rati pain, ba function jaldi komile doctor ke dekhaibi." },
};
const dashboardExtra = {
  en: { noCompleted: "No completed screenings yet.", unknown: "Unknown patient", scored: "Scored", progress: "In progress", last14: "Screenings per day" },
  hi: { noCompleted: "अभी तक कोई पूर्ण स्क्रीनिंग नहीं।", unknown: "अज्ञात मरीज़", scored: "स्कोर किया गया", progress: "प्रगति में", last14: "प्रतिदिन स्क्रीनिंग" },
  as: { noCompleted: "এতিয়ালৈকে কোনো সম্পূৰ্ণ স্ক্ৰীনিং নাই।", unknown: "অজ্ঞাত ৰোগী", scored: "স্ক'ৰ কৰা", progress: "চলি থকা", last14: "প্ৰতিদিনৰ স্ক্ৰীনিং" },
  nag: { noCompleted: "Etiya tak kunu complete screening nai.", unknown: "Najan patient", scored: "Score kora", progress: "Cholise", last14: "Din laga screening" },
};

export const DICTIONARIES = {
  en: { ...en, dashboard: { ...en.dashboard, ...dashboardExtra.en }, assistant: assistant.en, report: report.en },
  hi: { ...hi, dashboard: { ...hi.dashboard, ...dashboardExtra.hi }, assistant: assistant.hi, report: report.hi },
  as: { ...as, dashboard: { ...as.dashboard, ...dashboardExtra.as }, assistant: assistant.as, report: report.as },
  nag: { ...nag, dashboard: { ...nag.dashboard, ...dashboardExtra.nag }, assistant: assistant.nag, report: report.nag },
};

export function translate(dict, path, vars) {
  const parts = path.split(".");
  let node = dict;
  for (const p of parts) node = node?.[p];
  if (typeof node !== "string") {
    // fall back to English for anything missing in the target language
    let fallback = en;
    for (const p of parts) fallback = fallback?.[p];
    node = typeof fallback === "string" ? fallback : path;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) node = node.replaceAll(`{${k}}`, v);
  }
  return node;
}
