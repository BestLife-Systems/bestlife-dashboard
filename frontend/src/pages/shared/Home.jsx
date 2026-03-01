import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useLoadingVerb } from '../../hooks/useLoadingVerb'
import { fetchMyInstances, updateInstanceStatus } from '../../lib/tasksApi'
import { fetchMeetingInstances, deleteMeetingInstance } from '../../lib/meetingsApi'
import { fetchAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from '../../lib/announcementsApi'
import { apiGet, apiPatch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import Modal from '../../components/Modal'

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isOverdue(dateStr, status) {
  if (!dateStr || status === 'done' || status === 'skipped') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(dateStr + 'T00:00:00') < today
}

function isToday(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return d.toDateString() === today.toDateString()
}

function isThisWeek(dateStr) {
  if (!dateStr) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const diff = (d - today) / (1000 * 60 * 60 * 24)
  return diff >= 0 && diff < 7
}

function relativeTime(isoStr) {
  if (!isoStr) return ''
  const now = new Date()
  const d = new Date(isoStr)
  const diffMs = now - d
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function weatherInfo(code) {
  if (code <= 0) return { icon: '\u2600\uFE0F', label: 'Clear' }
  if (code <= 3) return { icon: '\u26C5', label: 'Partly Cloudy' }
  if (code <= 48) return { icon: '\uD83C\uDF2B\uFE0F', label: 'Foggy' }
  if (code <= 57) return { icon: '\uD83C\uDF26\uFE0F', label: 'Drizzle' }
  if (code <= 67) return { icon: '\uD83C\uDF27\uFE0F', label: 'Rain' }
  if (code <= 77) return { icon: '\uD83C\uDF28\uFE0F', label: 'Snow' }
  if (code <= 82) return { icon: '\uD83C\uDF27\uFE0F', label: 'Showers' }
  if (code <= 86) return { icon: '\uD83C\uDF28\uFE0F', label: 'Snow Showers' }
  if (code <= 99) return { icon: '\u26C8\uFE0F', label: 'Thunderstorm' }
  return { icon: '\uD83C\uDF24\uFE0F', label: 'Fair' }
}

const ANNOUNCEMENT_COLORS = {
  policy: '#60a5fa',
  celebration: '#fbbf24',
  outing: '#22c55e',
  general: 'var(--text-muted)',
}

const ANN_CATEGORIES = ['general', 'policy', 'celebration', 'outing']

const DAILY_MESSAGES = [
  // ── Motivational & Positive ──────────────────────────────────────
  "You're making a bigger impact than you realize.",
  "Small steps every day lead to big changes.",
  "Your energy sets the tone — and yours is great.",
  "The world is a little brighter because of the work you do.",
  "Progress, not perfection. You've got this.",
  "You didn't come this far to only come this far.",
  "Today is full of possibility — go make it count.",
  "Be the reason someone smiles today.",
  "You are exactly where you need to be right now.",
  "What you do matters. Keep going.",
  "Believe in the power of yet — you're not there yet, but you will be.",
  "Difficult roads often lead to beautiful destinations.",
  "Your potential is endless. Go do what you were born to do.",
  "Every day is a fresh start. Take a deep breath and begin again.",
  "You bring something to this team that no one else can.",
  "A little kindness goes a long way — including kindness to yourself.",
  "You're stronger than you think and braver than you feel.",
  "Good things are coming. Keep showing up.",
  "One kind word can change someone's entire day.",
  "Happiness is not by chance, but by choice.",
  "You are the author of your own story — make today a great chapter.",
  "Don't wait for opportunity. Create it.",
  "Courage doesn't mean you aren't scared. It means you keep going anyway.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Every expert was once a beginner.",
  "You don't have to be perfect to be amazing.",
  "The only limit to your impact is your imagination and commitment.",
  "It always seems impossible until it's done.",
  "Dream big. Start small. Act now.",
  "Success is not final, failure is not fatal — it's the courage to continue that counts.",
  "Your vibe attracts your tribe. Keep radiating positivity.",
  "Be so good they can't ignore you.",
  "Stars can't shine without darkness.",
  "In a world where you can be anything, be kind.",
  "The secret of getting ahead is getting started.",
  "You are capable of more than you know.",
  "Do what you can, with what you have, where you are.",
  "Rise above the storm and you will find the sunshine.",
  "Fall seven times, stand up eight.",
  "Act as if what you do makes a difference. It does.",
  "Your only competition is the person you were yesterday.",
  "Keep your face always toward the sunshine, and shadows will fall behind you.",
  "The comeback is always stronger than the setback.",
  "What lies behind us and what lies before us are tiny matters compared to what lies within us.",
  "Tough times don't last, but tough people do.",
  "You were born to stand out — don't try to fit in.",
  "Today's effort is tomorrow's result.",
  "When you focus on the good, the good gets better.",
  "No rain, no flowers.",
  "Your smile is your superpower.",
  "Throw kindness around like confetti.",
  "Life is short. Make every hair flip count.",
  "You are someone's reason to smile.",
  "Strive for progress, not perfection.",
  "A winner is a dreamer who never gives up.",
  "You've survived 100% of your worst days. You're doing amazing.",
  "Do something today that your future self will thank you for.",
  "Doubt kills more dreams than failure ever will.",
  "The energy you bring into a room matters. Bring light.",
  "It's okay to take it one day at a time.",
  "Trust the timing of your life.",
  "Bloom where you are planted.",
  "You are enough. You have enough. You do enough.",
  "Don't look back — you're not going that way.",
  "The sun will rise and we will try again.",
  "Stay close to anything that makes you glad you are alive.",
  "Every accomplishment starts with the decision to try.",
  "Not all heroes wear capes. Some wear scrubs. Some wear smiles.",
  "There is no elevator to success. You have to take the stairs.",
  "Believe you can and you're halfway there.",
  "Today is a good day to have a good day.",
  "You don't need a new day to start over. You only need a new mindset.",
  "If plan A didn't work, the alphabet has 25 more letters.",
  "Start where you are. Use what you have. Do what you can.",
  "Creativity is intelligence having fun.",
  "Success usually comes to those who are too busy to be looking for it.",
  "Just when the caterpillar thought the world was ending, it became a butterfly.",

  // ── Gratitude & Mindfulness ──────────────────────────────────────
  "Take a moment right now to appreciate how far you've come.",
  "Gratitude turns what we have into enough.",
  "Three deep breaths can reset your entire nervous system. Try it.",
  "Name three things you're grateful for today — it rewires your brain for positivity.",
  "You are not your to-do list. Take a breath.",
  "Being present is the greatest gift you can give yourself.",
  "What went right today? Focus on that.",
  "Notice the good around you. There's more of it than you think.",
  "Slow down. The work will still be there. Your peace of mind matters.",
  "Drink some water. You're not just thirsty — you're a well-hydrated superstar in the making.",
  "Have you taken a real break today? You deserve one.",
  "Joy is not in things. It is in us.",
  "Pause. Breathe. Proceed with kindness.",
  "Give yourself permission to rest. It's not lazy — it's necessary.",
  "Gratitude is the healthiest of all human emotions.",
  "Be gentle with yourself. You're doing the best you can.",
  "The present moment is the only moment available to us — and it is the door to all moments.",
  "Inhale confidence, exhale doubt.",
  "You don't always need a plan. Sometimes you just need to breathe, trust, and let go.",
  "Worrying does not take away tomorrow's troubles. It takes away today's peace.",
  "What would you do today if you knew you couldn't fail?",
  "Mindfulness is a superpower. You already have it.",
  "You can't pour from an empty cup. Take care of yourself first.",

  // ── Teamwork & Connection ────────────────────────────────────────
  "Together we can accomplish more than any of us could alone.",
  "The strength of the team is each individual member.",
  "Great things happen when people support each other.",
  "Alone we can do so little; together we can do so much.",
  "Behind every great team is a group of people who show up for each other.",
  "Collaboration makes ordinary people achieve extraordinary results.",
  "No one is useless in this world who lightens the burdens of another.",
  "Your colleagues are rooting for you. Even when it doesn't feel like it.",
  "We rise by lifting others.",
  "If you want to go fast, go alone. If you want to go far, go together.",
  "The nicest thing about teamwork is that you always have others on your side.",
  "Helping one person might not change the world, but it could change the world for one person.",
  "Connection is the energy created when people feel seen, heard, and valued.",
  "A team is not a group of people who work together — it's a group of people who trust each other.",
  "Ask someone how they're really doing today. Then listen.",

  // ── Self-Care & Wellness ─────────────────────────────────────────
  "Mental health is not a destination — it's a process.",
  "Rest is productive. Say it again.",
  "You are allowed to set boundaries. It's not selfish — it's self-respect.",
  "Sleep is the Swiss army knife of health. Prioritize it tonight.",
  "Your mental health is more important than your productivity.",
  "Asking for help is a sign of strength, not weakness.",
  "It's okay to not be okay. What matters is that you don't stay there alone.",
  "Take care of your body. It's the only place you have to live.",
  "Healing is not linear. Be patient with yourself.",
  "The strongest people are not those who show strength in front of us but those who win battles we know nothing about.",
  "Self-care is not self-indulgence. It is self-preservation.",
  "Your feelings are valid. All of them.",
  "A 10-minute walk can do wonders for your mood. Give it a try today.",
  "Comparison is the thief of joy. You're on your own unique path.",
  "It's okay to outgrow people, places, and things. That's called life.",
  "Protect your peace like it's your most valuable possession. Because it is.",
  "Talk to yourself like you would talk to someone you love.",
  "You can't control everything. But you can control how you respond.",
  "You are not behind. You are not broken. You are just unfolding.",
  "Progress is progress, no matter how small.",

  // ── Smile & Mental Health Fun Facts ──────────────────────────────
  "😊 Fun fact: Smiling releases endorphins, serotonin, and dopamine — your brain's natural feel-good trio.",
  "😊 Fun fact: It takes only 17 muscles to smile but 43 to frown. Efficiency win!",
  "😊 Fun fact: Smiling is contagious — when you see someone smile, your brain automatically wants to return it.",
  "😊 Fun fact: Studies show that smiling can actually lower your heart rate during stressful situations.",
  "😊 Fun fact: Even a forced smile can trick your brain into feeling happier. Try it right now!",
  "😊 Fun fact: Children smile an average of 400 times a day. Adults? Only about 20. Let's close that gap!",
  "😊 Fun fact: Smiling makes you appear more approachable, competent, and trustworthy to others.",
  "😊 Fun fact: A genuine smile (called a Duchenne smile) engages the muscles around your eyes — not just your mouth.",
  "😊 Fun fact: Smiling boosts your immune system by helping your body produce more white blood cells.",
  "😊 Fun fact: People who smile more tend to live an average of 7 years longer, according to research.",
  "😊 Fun fact: Your brain can't always tell the difference between a real and fake smile — both trigger happy chemicals.",
  "😊 Fun fact: Smiling during a workout can reduce your perceived effort and improve endurance.",
  "😊 Fun fact: A smile is the universal sign of happiness — recognized across every culture on Earth.",
  "😊 Fun fact: Laughter and smiling together can burn up to 40 calories in 15 minutes.",
  "😊 Fun fact: Seeing a smiling face activates your orbitofrontal cortex — the brain's reward center.",
  "😊 Fun fact: Babies start smiling in the womb — they're practicing before they even meet you.",
  "😊 Fun fact: Your brain processes a smile in as little as 40 milliseconds — faster than you can blink.",
  "😊 Fun fact: Smiling can lower cortisol levels by up to 39%, helping you feel calmer under pressure.",
  "😊 Fun fact: Employees who smile more are perceived as more competent and are promoted more often.",
  "😊 Fun fact: A single smile can generate the same level of brain stimulation as 2,000 bars of chocolate.",
  "😊 Fun fact: Smiling is one of the few universal human expressions — even people born blind do it.",
  "😊 Fun fact: The average person smiles about 20 times a day. You've already beaten that, right?",
  "😊 Fun fact: Smiling triggers a feedback loop in your brain that reinforces feelings of joy.",
  "😊 Fun fact: People are 86% more likely to talk to strangers if the stranger is smiling.",
  "😊 Fun fact: Smiling makes you look younger — it naturally lifts the face and projects vitality.",

  // ── Psychology & Brain Fun Facts ─────────────────────────────────
  "🧠 Fun fact: Your brain generates about 70,000 thoughts per day. Make some of them kind ones.",
  "🧠 Fun fact: Writing down three good things each day for two weeks measurably increases happiness for six months.",
  "🧠 Fun fact: The brain treats social rejection the same way it treats physical pain. Be kind to people.",
  "🧠 Fun fact: Listening to music you love triggers the same brain chemicals as eating good food.",
  "🧠 Fun fact: Spending just 20 minutes in nature significantly reduces stress hormone levels.",
  "🧠 Fun fact: Helping others activates the same parts of the brain stimulated by food and money.",
  "🧠 Fun fact: Your brain is roughly 73% water. Even mild dehydration affects mood, energy, and thinking.",
  "🧠 Fun fact: Acts of kindness create a 'helper's high' — a rush of endorphins in your brain.",
  "🧠 Fun fact: Hugging for 20+ seconds releases oxytocin, which reduces stress and lowers blood pressure.",
  "🧠 Fun fact: Your brain can't actually multitask. It rapidly switches between tasks, losing efficiency each time.",
  "🧠 Fun fact: Expressing gratitude rewires your brain to focus more on positive experiences over time.",
  "🧠 Fun fact: The scent of lavender has been shown to reduce anxiety and improve sleep quality.",
  "🧠 Fun fact: Laughter reduces stress hormones and increases immune cells and infection-fighting antibodies.",
  "🧠 Fun fact: Deep breathing activates the parasympathetic nervous system, telling your body it's safe to relax.",
  "🧠 Fun fact: Handwritten notes activate different brain circuits than typing — and people treasure them more.",
  "🧠 Fun fact: Looking at photos of loved ones can actually reduce the sensation of physical pain.",
  "🧠 Fun fact: Walking boosts creative thinking by an average of 60%.",
  "🧠 Fun fact: Sunlight boosts serotonin production. Even 10 minutes outside can lift your mood.",
  "🧠 Fun fact: The human brain starts slowing down at age 24 — but wisdom and emotional intelligence keep growing.",
  "🧠 Fun fact: Daydreaming uses the same brain processes associated with imagination and creativity.",
  "🧠 Fun fact: Learning something new physically rewires your brain, creating stronger neural connections.",
  "🧠 Fun fact: Positive self-talk improves performance under pressure by up to 25%.",
  "🧠 Fun fact: Your sense of smell is the sense most strongly linked to memory and emotion.",
  "🧠 Fun fact: Reading fiction increases empathy by helping your brain simulate other people's experiences.",
  "🧠 Fun fact: Singing in the shower releases endorphins and boosts your immune system. Belt it out!",
  "🧠 Fun fact: The brain can process images in as little as 13 milliseconds — faster than a blink.",
  "🧠 Fun fact: Chewing gum has been shown to reduce anxiety and improve alertness during stressful tasks.",
  "🧠 Fun fact: Random acts of kindness can increase your own happiness for up to three months.",
  "🧠 Fun fact: Simply anticipating something fun can raise endorphin levels by 27%.",
  "🧠 Fun fact: People who regularly practice gratitude report 25% fewer health complaints.",

  // ── Lighthearted & Fun ───────────────────────────────────────────
  "You're a limited edition. There's only one of you. That's your superpower.",
  "Plot twist: you're the main character.",
  "If today were a movie, you'd be the hero. Act like it.",
  "Coffee may help, but your positive attitude does the heavy lifting.",
  "You're not just surviving today — you're crushing it.",
  "Everything is figureoutable.",
  "You miss 100% of the shots you don't take. So take the shot.",
  "Even Mondays can be awesome. Okay, most Mondays. Fine, some Mondays.",
  "You are the WiFi signal in a room full of people searching for connection.",
  "Life is 10% what happens to you and 90% how you react to it.",
  "The best things in life are the people you love, the places you've been, and the memories you've made.",
  "When nothing goes right, go left.",
  "Be a voice, not an echo.",
  "Stressed spelled backwards is desserts. Coincidence? I think not.",
  "Today's agenda: be awesome. That's it. That's the list.",
  "You're proof that good things take time.",
  "The best project you'll ever work on is you.",
  "Make today so awesome that yesterday gets jealous.",
  "Keep your heels, head, and standards high.",
  "Collect moments, not things.",
  "Some days you eat salads and go to the gym. Some days you eat pizza and refuse to put on pants. It's called balance.",
  "Life update: currently thriving.",
  "You've got the same number of hours in a day as Beyoncé. Let's go.",
  "Stay humble, hustle hard, and always be kind.",
  "The only bad workout is the one that didn't happen.",
]

// ── Inline icon components ──

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// ── Section Header with action buttons ──────────────────────────

function SectionHeader({ icon, title, subtitle, showButtons, onAdd, onEdit, onRemove, editLabel, removeLabel }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
      <div className="card-title" style={{ margin: 0 }}>
        <span style={{ marginRight: '0.375rem' }}>{icon}</span> {title}
        {subtitle && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>{subtitle}</span>}
      </div>
      {showButtons && (
        <div className="home-section-actions">
          {onAdd && <button className="btn btn--primary btn--small home-action-btn" onClick={onAdd}>+ Add</button>}
          {onEdit && <button className="btn btn--primary btn--small home-action-btn" onClick={onEdit}>{editLabel || 'Edit'}</button>}
          {onRemove && <button className="btn btn--primary btn--small home-action-btn" onClick={onRemove}>{removeLabel || '- Remove'}</button>}
        </div>
      )}
    </div>
  )
}

// ── Main Home Component ──────────────────────────────────────────

export default function Home() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  // State
  const [tasks, setTasks] = useState([])
  const [loadingTasks, setLoadingTasks] = useState(true)
  const [wins, setWins] = useState([])
  const [loadingWins, setLoadingWins] = useState(true)
  const [meetings, setMeetings] = useState([])
  const [loadingMeetings, setLoadingMeetings] = useState(true)
  const [announcements, setAnnouncements] = useState([])
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true)
  const [weather, setWeather] = useState(null)
  const [impactHours, setImpactHours] = useState(null)
  const [editingBaseline, setEditingBaseline] = useState(false)
  const [baselineInput, setBaselineInput] = useState('')
  const [showAllWins, setShowAllWins] = useState(false)
  const [birthdayAnnouncements, setBirthdayAnnouncements] = useState([])
  const [undoTask, setUndoTask] = useState(null)
  const undoTimerRef = useRef(null)

  // Modal / toggle states
  const [winModal, setWinModal] = useState({ open: false, editing: null })
  const [winForm, setWinForm] = useState({ category: 'business', body: '' })
  const [winSaving, setWinSaving] = useState(false)
  const [winEditMode, setWinEditMode] = useState(false)
  const [winRemoveMode, setWinRemoveMode] = useState(false)

  const [meetingModal, setMeetingModal] = useState({ open: false, editing: null })
  const [meetingForm, setMeetingForm] = useState({ title: '', meeting_date: todayStr(), meeting_time: '' })
  const [meetingSaving, setMeetingSaving] = useState(false)
  const [meetingEditMode, setMeetingEditMode] = useState(false)
  const [meetingRemoveMode, setMeetingRemoveMode] = useState(false)

  const [annModal, setAnnModal] = useState({ open: false, editing: null })
  const [annForm, setAnnForm] = useState({ title: '', body: '', category: 'general', effective_date: todayStr(), expiration_date: '' })
  const [annSaving, setAnnSaving] = useState(false)
  const [annEditMode, setAnnEditMode] = useState(false)
  const [annRemoveMode, setAnnRemoveMode] = useState(false)

  const verb = useLoadingVerb(loadingTasks || loadingWins || loadingMeetings)
  const firstName = profile?.first_name || 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const [dailyMessage] = useState(() => DAILY_MESSAGES[Math.floor(Math.random() * DAILY_MESSAGES.length)])

  useEffect(() => {
    loadTasks()
    loadWins()
    loadMeetings()
    loadAnnouncements()
    loadWeather()
    loadImpactHours()
  }, [])

  // ── Data loaders ──

  async function loadTasks() {
    setLoadingTasks(true)
    try {
      const data = await fetchMyInstances()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const sevenDays = new Date(today)
      sevenDays.setDate(sevenDays.getDate() + 7)
      const sevenDaysStr = sevenDays.toISOString().split('T')[0]
      const upcoming = (data || [])
        .filter(t => t.status !== 'done' && t.status !== 'skipped')
        .filter(t => !t.due_date || t.due_date <= sevenDaysStr)
        .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))
      // Deduplicate by title + due_date
      const seen = new Set()
      const deduped = upcoming.filter(t => {
        const key = `${t.title}|${t.due_date}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      setTasks(deduped)
    } catch (err) {
      console.error('Failed to load tasks:', err)
      setTasks([])
    } finally {
      setLoadingTasks(false)
    }
  }

  const handleCompleteTask = useCallback(async (task) => {
    // Mark done in the backend immediately so it persists even if user navigates away
    try { await updateInstanceStatus(task.id, 'done') } catch {}
    setTasks(prev => prev.filter(t => t.id !== task.id))
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
    setUndoTask({ task })
    undoTimerRef.current = setTimeout(() => {
      setUndoTask(null)
      undoTimerRef.current = null
    }, 5000)
  }, [])

  const handleUndoTask = useCallback(async () => {
    if (!undoTask) return
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null }
    // Revert to pending in the backend
    try { await updateInstanceStatus(undoTask.task.id, 'pending') } catch {}
    setTasks(prev => [...prev, undoTask.task].sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')))
    setUndoTask(null)
  }, [undoTask])

  useEffect(() => { return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) } }, [])

  async function loadWins() {
    setLoadingWins(true)
    try {
      const { data, error } = await supabase.from('wins').select('*, users(first_name, last_name)').order('created_at', { ascending: false }).limit(20)
      if (error) throw error
      setWins(data || [])
    } catch (err) { console.error('Failed to load wins:', err); setWins([]) } finally { setLoadingWins(false) }
  }

  async function loadMeetings() {
    setLoadingMeetings(true)
    try {
      const data = await fetchMeetingInstances()
      const all = data || []
      setMeetings(all.filter(m => !m.title.includes('Birthday')).slice(0, 6))
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const thirtyDays = new Date(today); thirtyDays.setDate(thirtyDays.getDate() + 30)
      setBirthdayAnnouncements(
        all.filter(m => m.title.includes('Birthday')).filter(m => { const d = new Date(m.meeting_date + 'T00:00:00'); return d >= today && d <= thirtyDays })
          .map(b => ({ id: 'bday-' + b.id, _meetingId: b.id, title: b.title, body: null, category: 'celebration', effective_date: b.meeting_date, meeting_date: b.meeting_date, meeting_time: b.meeting_time, _isBirthday: true }))
      )
    } catch (err) { console.error('Failed to load meetings:', err); setMeetings([]); setBirthdayAnnouncements([]) } finally { setLoadingMeetings(false) }
  }

  async function loadAnnouncements() {
    setLoadingAnnouncements(true)
    try { const data = await fetchAnnouncements(); setAnnouncements(data || []) }
    catch (err) { console.error('Failed to load announcements:', err); setAnnouncements([]) }
    finally { setLoadingAnnouncements(false) }
  }

  async function loadWeather() {
    try {
      let lat = 39.08, lon = -74.82, city = 'Cape May Court House'
      if (navigator.geolocation) { try { const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000 })); lat = pos.coords.latitude; lon = pos.coords.longitude; city = '' } catch {} }
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`)
      const data = await res.json()
      if (data.current) setWeather({ temp: Math.round(data.current.temperature_2m), code: data.current.weather_code, wind: Math.round(data.current.wind_speed_10m), humidity: data.current.relative_humidity_2m, city: city || data.timezone?.split('/').pop()?.replace(/_/g, ' ') || '' })
    } catch {}
  }

  async function loadImpactHours() {
    try {
      const data = await apiGet('/impact-hours')
      setImpactHours(data)
    } catch (err) { console.error('Failed to load impact hours:', err) }
  }

  async function saveBaseline() {
    try {
      await apiPatch('/impact-hours', { baseline: parseFloat(baselineInput) || 0 })
      await loadImpactHours()
      setEditingBaseline(false)
    } catch (err) {
      console.error('Failed to save baseline:', err)
      alert('Failed to save baseline: ' + (err.message || 'Unknown error'))
    }
  }

  // ── Win handlers ──
  function openAddWin() { setWinForm({ category: 'business', body: '' }); setWinModal({ open: true, editing: null }) }
  function openEditWin(win) { setWinForm({ category: win.category, body: win.body }); setWinModal({ open: true, editing: win }); setWinEditMode(false) }
  async function saveWin() {
    if (!winForm.body.trim()) return
    setWinSaving(true)
    try {
      if (winModal.editing) await supabase.from('wins').update({ category: winForm.category, body: winForm.body.trim() }).eq('id', winModal.editing.id)
      else await supabase.from('wins').insert({ user_id: profile.id, category: winForm.category, body: winForm.body.trim() })
      setWinModal({ open: false, editing: null }); loadWins()
    } catch (err) { console.error('Failed to save win:', err) } finally { setWinSaving(false) }
  }
  async function removeWin(win) { try { await supabase.from('wins').delete().eq('id', win.id); loadWins() } catch (err) { console.error(err) } }

  // ── Meeting handlers ──
  function openAddMeeting() { setMeetingForm({ title: '', meeting_date: todayStr(), meeting_time: '' }); setMeetingModal({ open: true, editing: null }) }
  function openEditMeeting(mtg) { setMeetingForm({ title: mtg.title || '', meeting_date: mtg.meeting_date || todayStr(), meeting_time: mtg.meeting_time || '' }); setMeetingModal({ open: true, editing: mtg }); setMeetingEditMode(false) }
  async function saveMeeting() {
    if (!meetingForm.title.trim()) return
    setMeetingSaving(true)
    try {
      if (meetingModal.editing) await supabase.from('meeting_instances').update({ title: meetingForm.title.trim(), meeting_date: meetingForm.meeting_date, meeting_time: meetingForm.meeting_time || null }).eq('id', meetingModal.editing.id)
      else await supabase.from('meeting_instances').insert({ title: meetingForm.title.trim(), meeting_date: meetingForm.meeting_date, meeting_time: meetingForm.meeting_time || null })
      setMeetingModal({ open: false, editing: null }); loadMeetings()
    } catch (err) { console.error('Failed to save meeting:', err) } finally { setMeetingSaving(false) }
  }
  async function removeMeeting(mtg) { try { await deleteMeetingInstance(mtg.id); loadMeetings() } catch (err) { console.error(err) } }

  // ── Announcement handlers ──
  function openAddAnn() { setAnnForm({ title: '', body: '', category: 'general', effective_date: todayStr(), expiration_date: '' }); setAnnModal({ open: true, editing: null }) }
  function openEditAnn(ann) { setAnnForm({ title: ann.title || '', body: ann.body || '', category: ann.category || 'general', effective_date: ann.effective_date || todayStr(), expiration_date: ann.expiration_date || '' }); setAnnModal({ open: true, editing: ann }); setAnnEditMode(false) }
  async function saveAnn() {
    if (!annForm.title.trim()) return
    setAnnSaving(true)
    try {
      const payload = { title: annForm.title.trim(), body: annForm.body.trim() || null, category: annForm.category, audience_roles: [], effective_date: annForm.effective_date, expiration_date: annForm.expiration_date || null }
      if (annModal.editing) await updateAnnouncement(annModal.editing.id, payload)
      else await createAnnouncement(payload)
      setAnnModal({ open: false, editing: null }); loadAnnouncements()
    } catch (err) { console.error('Failed to save announcement:', err) } finally { setAnnSaving(false) }
  }
  async function removeAnn(ann) { try { await deleteAnnouncement(ann.id); loadAnnouncements() } catch (err) { console.error(err) } }

  // ── Render helpers ──
  function renderLoading(msg) {
    return (<div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem 0', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}><div className="loading-spinner loading-spinner--small" />{msg || verb + '\u2026'}</div>)
  }

  return (
    <div>
      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h2 className="page-title">{greeting}, {firstName}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem', fontStyle: 'italic' }}>{dailyMessage}</p>
        </div>

        {impactHours && (
          <div className="impact-counter">
            <span className="impact-number">{Math.round(impactHours.total).toLocaleString()}</span>
            <span className="impact-label">Total Hours of Impact</span>
            {isAdmin && !editingBaseline && (
              <button className="impact-edit-btn" onClick={() => { setBaselineInput(String(impactHours.baseline || 0)); setEditingBaseline(true) }} title="Set baseline hours">Set Baseline</button>
            )}
            {editingBaseline && (
              <span style={{ display: 'inline-flex', gap: '0.25rem', alignItems: 'center' }}>
                <input type="number" value={baselineInput} onChange={e => setBaselineInput(e.target.value)} className="form-input" style={{ width: '9rem', fontSize: '0.85rem', padding: '0.3rem 0.5rem' }} placeholder="Baseline hrs" />
                <button className="btn btn--xs btn--primary" onClick={saveBaseline}>Save</button>
                <button className="btn btn--xs btn--ghost" onClick={() => setEditingBaseline(false)}>Cancel</button>
              </span>
            )}
          </div>
        )}

        {weather && (() => {
          const w = weatherInfo(weather.code)
          return (
            <div className="weather-widget">
              <div className="weather-main"><span className="weather-icon">{w.icon}</span><span className="weather-temp">{weather.temp}°F</span></div>
              <div className="weather-details">
                <span className="weather-label">{w.label}</span>
                {weather.city && <span className="weather-city">{weather.city}</span>}
                <span className="weather-meta">{'\uD83D\uDCA7'} {weather.humidity}%  ·  {'\uD83D\uDCA8'} {weather.wind} mph</span>
              </div>
            </div>
          )
        })()}
      </div>

      <div className="home-widgets">

        {/* ═══ 1. WINS ═══ */}
        <div className="card home-widget">
          <SectionHeader icon="🏆" title="Wins" showButtons={true}
            onAdd={openAddWin}
            onEdit={isAdmin ? () => setWinEditMode(m => !m) : null}
            onRemove={isAdmin ? () => setWinRemoveMode(m => !m) : null}
            editLabel={winEditMode ? 'Done' : 'Edit'}
            removeLabel={winRemoveMode ? 'Done' : '- Remove'}
          />
          {loadingWins ? renderLoading() : wins.length === 0 ? (
            <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No wins yet — be the first to share one!</div>
          ) : (
            <>
              <div className="home-wins-feed">
                {wins.slice(0, showAllWins ? wins.length : 4).map(win => (
                  <div key={win.id} className={`home-win-bar home-win-bar--${win.category}`} style={{ position: 'relative' }}>
                    <div className="home-win-bar-text" style={{ paddingRight: (winEditMode || winRemoveMode) ? '2rem' : 0 }}>{win.body}</div>
                    <div className="home-win-bar-meta">{win.users ? `${win.users.first_name} ${win.users.last_name}` : ''}{' · '}{relativeTime(win.created_at)}</div>
                    {winEditMode && <button className="home-inline-action home-inline-edit" onClick={() => openEditWin(win)} title="Edit"><PencilIcon /></button>}
                    {winRemoveMode && <button className="home-inline-action home-inline-remove" onClick={() => removeWin(win)} title="Remove"><XIcon /></button>}
                  </div>
                ))}
              </div>
              {wins.length > 4 && !showAllWins && <button className="btn btn--ghost btn--small" onClick={() => setShowAllWins(true)} style={{ width: '100%', marginTop: '0.5rem' }}>View all {wins.length} wins →</button>}
              {showAllWins && wins.length > 4 && <button className="btn btn--ghost btn--small" onClick={() => setShowAllWins(false)} style={{ width: '100%', marginTop: '0.5rem' }}>Show less</button>}
            </>
          )}
        </div>

        {/* ═══ 2. TASKS + MEETINGS ═══ */}
        <div className="home-two-col">

          {/* ── Tasks (no action buttons — managed via Task Management in sidebar) ── */}
          <div className="card home-widget">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="card-title" style={{ margin: 0 }}>
                <span style={{ marginRight: '0.375rem' }}>✅</span> My Tasks
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: '0.5rem' }}>Next 7 days</span>
              </div>
              <button className="btn btn--ghost btn--small" onClick={() => navigate('/my-work')}>View all →</button>
            </div>
            {loadingTasks ? renderLoading() : tasks.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>You're all caught up — no pending tasks!</div>
            ) : (
              <div className="home-task-list">
                {tasks.map(task => (
                  <div key={task.id} className="home-task-item">
                    <span className="home-task-due" style={{ color: isOverdue(task.due_date, task.status) ? 'var(--danger)' : 'var(--accent)', fontWeight: isToday(task.due_date) ? 600 : 400 }}>
                      {isOverdue(task.due_date, task.status) && '\u26A0 '}{isToday(task.due_date) ? 'Today' : formatDate(task.due_date)}
                    </span>
                    <span className="home-task-title">{task.title}</span>
                    <button className="home-task-check" onClick={(e) => { e.stopPropagation(); handleCompleteTask(task) }} title="Mark as done">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Meetings ── */}
          <div className="card home-widget">
            <SectionHeader icon="📅" title="Upcoming Meetings" showButtons={isAdmin}
              onAdd={openAddMeeting}
              onEdit={() => setMeetingEditMode(m => !m)}
              onRemove={() => setMeetingRemoveMode(m => !m)}
              editLabel={meetingEditMode ? 'Done' : 'Edit'}
              removeLabel={meetingRemoveMode ? 'Done' : '- Remove'}
            />
            {loadingMeetings ? renderLoading() : meetings.length === 0 ? (
              <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No upcoming meetings scheduled.</div>
            ) : (
              <div className="home-meetings-list">
                {meetings.map(mtg => (
                  <div key={mtg.id} className={`home-meeting-item ${isToday(mtg.meeting_date) ? 'home-meeting-item--today' : isThisWeek(mtg.meeting_date) ? 'home-meeting-item--week' : ''}`}>
                    <span className="home-meeting-date">{isToday(mtg.meeting_date) ? 'Today' : formatDate(mtg.meeting_date)}</span>
                    <span className="home-meeting-title">{mtg.title}</span>
                    {mtg.meeting_time && !(meetingEditMode || meetingRemoveMode) && <span className="home-meeting-time">{mtg.meeting_time}</span>}
                    {meetingEditMode && (
                      <button onClick={() => openEditMeeting(mtg)} title="Edit" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--accent-glow)', color: 'var(--accent)', marginLeft: 'auto' }}><PencilIcon /></button>
                    )}
                    {meetingRemoveMode && (
                      <button onClick={() => removeMeeting(mtg)} title="Remove" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--danger-bg)', color: 'var(--danger)', marginLeft: 'auto' }}><XIcon /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ═══ 3. ANNOUNCEMENTS ═══ */}
        <div className="card home-widget">
          <SectionHeader icon="📢" title="Announcements" showButtons={isAdmin}
            onAdd={openAddAnn}
            onEdit={() => { setAnnEditMode(m => !m); setAnnRemoveMode(false) }}
            onRemove={() => { setAnnRemoveMode(m => !m); setAnnEditMode(false) }}
            editLabel={annEditMode ? 'Done' : 'Edit'}
            removeLabel={annRemoveMode ? 'Done' : '- Remove'}
          />
          {(() => {
            const allAnn = [...announcements.filter(a => { const td = todayStr(); if (a.effective_date && a.effective_date > td) return false; if (a.expiration_date && a.expiration_date < td) return false; return true }), ...birthdayAnnouncements].sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''))
            if (loadingAnnouncements && loadingMeetings) return renderLoading()
            if (allAnn.length === 0) return <div style={{ padding: '1.5rem 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No announcements right now.</div>
            return (
              <div>
                {allAnn.map(ann => {
                  const handleEdit = () => {
                    if (ann._isBirthday) {
                      openEditMeeting({ id: ann._meetingId, title: ann.title, meeting_date: ann.meeting_date, meeting_time: ann.meeting_time })
                    } else {
                      openEditAnn(ann)
                    }
                  }
                  const handleRemove = () => {
                    if (ann._isBirthday) {
                      removeMeeting({ id: ann._meetingId })
                    } else {
                      removeAnn(ann)
                    }
                  }
                  return (
                    <div
                      key={ann.id}
                      className="home-announcement"
                    >
                      <span className="home-announcement-badge" style={{ background: ANNOUNCEMENT_COLORS[ann.category] || ANNOUNCEMENT_COLORS.general }}>{ann.category}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500, color: 'var(--text-bright)', fontSize: '0.875rem', marginBottom: '0.125rem' }}>{ann.title}</div>
                        {ann.body && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{ann.body.length > 200 ? ann.body.slice(0, 200) + '\u2026' : ann.body}</div>}
                      </div>
                      {!annEditMode && !annRemoveMode && <span className="home-announcement-date">{formatDate(ann.effective_date)}</span>}
                      {annEditMode && (
                        <button onClick={handleEdit} title="Edit" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--accent-glow)', color: 'var(--accent)', marginLeft: 'auto' }}><PencilIcon /></button>
                      )}
                      {annRemoveMode && (
                        <button onClick={handleRemove} title="Remove" style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: 'var(--danger-bg)', color: 'var(--danger)', marginLeft: 'auto' }}><XIcon /></button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

      </div>

      {/* ── Undo Toast ── */}
      {undoTask && <div className="undo-toast"><span>Completed "<strong>{undoTask.task.title}</strong>"</span><button className="undo-toast-btn" onClick={handleUndoTask}>Undo</button></div>}

      {/* ── Win Modal ── */}
      <Modal open={winModal.open} onClose={() => setWinModal({ open: false, editing: null })} title={winModal.editing ? 'Edit Win' : 'Add a Win'}>
        <div className="win-category-toggle">
          <button className={`win-cat-btn ${winForm.category === 'business' ? 'win-cat-btn--active win-cat-btn--business' : ''}`} onClick={() => setWinForm(f => ({ ...f, category: 'business' }))}>Business</button>
          <button className={`win-cat-btn ${winForm.category === 'personal' ? 'win-cat-btn--active win-cat-btn--personal' : ''}`} onClick={() => setWinForm(f => ({ ...f, category: 'personal' }))}>Personal</button>
        </div>
        <textarea className="win-textarea" placeholder="What's the win?" value={winForm.body} onChange={e => setWinForm(f => ({ ...f, body: e.target.value }))} rows={3} autoFocus />
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={saveWin} disabled={winSaving || !winForm.body.trim()}>{winSaving ? 'Saving...' : winModal.editing ? 'Save Changes' : 'Add Win'}</button>
          <button className="btn btn--secondary" onClick={() => setWinModal({ open: false, editing: null })}>Cancel</button>
        </div>
      </Modal>

      {/* ── Meeting Modal ── */}
      <Modal open={meetingModal.open} onClose={() => setMeetingModal({ open: false, editing: null })} title={meetingModal.editing ? 'Edit Meeting' : 'Add Meeting'}>
        <div className="form-field"><label>Title *</label><input value={meetingForm.title} onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Team Standup" autoFocus /></div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <div className="form-field"><label>Date</label><input type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm(f => ({ ...f, meeting_date: e.target.value }))} /></div>
          <div className="form-field"><label>Time (optional)</label><input type="time" value={meetingForm.meeting_time} onChange={e => setMeetingForm(f => ({ ...f, meeting_time: e.target.value }))} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={saveMeeting} disabled={meetingSaving || !meetingForm.title.trim()}>{meetingSaving ? 'Saving...' : meetingModal.editing ? 'Save Changes' : 'Add Meeting'}</button>
          <button className="btn btn--secondary" onClick={() => setMeetingModal({ open: false, editing: null })}>Cancel</button>
        </div>
      </Modal>

      {/* ── Announcement Modal ── */}
      <Modal open={annModal.open} onClose={() => setAnnModal({ open: false, editing: null })} title={annModal.editing ? 'Edit Announcement' : 'Add Announcement'} wide>
        <div className="form-field"><label>Title *</label><input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Office Closed Friday" autoFocus /></div>
        <div className="form-field" style={{ marginTop: '0.75rem' }}><label>Body</label><textarea value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} placeholder="Optional details..." rows={3} /></div>
        <div className="form-row" style={{ marginTop: '0.75rem' }}>
          <div className="form-field"><label>Category</label><select value={annForm.category} onChange={e => setAnnForm(f => ({ ...f, category: e.target.value }))}>{ANN_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
          <div className="form-field"><label>Effective Date</label><input type="date" value={annForm.effective_date} onChange={e => setAnnForm(f => ({ ...f, effective_date: e.target.value }))} /></div>
          <div className="form-field"><label>Expires (optional)</label><input type="date" value={annForm.expiration_date} onChange={e => setAnnForm(f => ({ ...f, expiration_date: e.target.value }))} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn--primary" onClick={saveAnn} disabled={annSaving || !annForm.title.trim()}>{annSaving ? 'Saving...' : annModal.editing ? 'Save Changes' : 'Add Announcement'}</button>
          <button className="btn btn--secondary" onClick={() => setAnnModal({ open: false, editing: null })}>Cancel</button>
        </div>
      </Modal>
    </div>
  )
}
