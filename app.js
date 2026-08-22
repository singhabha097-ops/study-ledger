const { useState, useEffect } = React;

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const SUBJECT_COLORS = ['#2D6A4F', '#1D4E89', '#9C3D54', '#B98B2A', '#5B3A9C', '#2A6F77', '#8A4B2A', '#3D5A80'];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const blankQuestion = () => ({ id: uid(), q: '', options: ['', '', '', ''], correct: 0 });
const usernameToEmail = (username) => `${username.trim().toLowerCase()}@studyledger.local`;

function friendlyAuthError(err) {
  const code = err && err.code;
  if (code === 'auth/email-already-in-use') return 'That username is already taken.';
  if (code === 'auth/weak-password') return 'Password should be at least 6 characters.';
  if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-credential' || code === 'auth/invalid-login-credentials') return 'Username or password is incorrect.';
  if (code === 'auth/invalid-email') return 'Enter a valid username (letters and numbers only).';
  return 'Something went wrong. Please try again.';
}

function App() {
  const [authUser, setAuthUser] = useState(undefined); // undefined = loading, null = signed out
  const [profileUsername, setProfileUsername] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [scores, setScores] = useState({});
  const [screen, setScreen] = useState('landing'); // landing | adminLogin | studentAuth
  const [error, setError] = useState('');

  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [editingChapter, setEditingChapter] = useState(null);
  const [newSubjectName, setNewSubjectName] = useState('');

  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminError, setAdminError] = useState('');

  const [stuSubjectId, setStuSubjectId] = useState(null);
  const [stuChapterId, setStuChapterId] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);

  const isAdmin = authUser && authUser.email === ADMIN_EMAIL;

  // Auth state
  useEffect(() => {
    return auth.onAuthStateChanged(async (user) => {
      setAuthUser(user);
      if (user && user.email !== ADMIN_EMAIL) {
        try {
          const doc = await db.collection('profiles').doc(user.uid).get();
          setProfileUsername(doc.exists ? doc.data().username : user.email.split('@')[0]);
        } catch (e) {
          setProfileUsername(user.email.split('@')[0]);
        }
      }
    });
  }, []);

  // Subjects (real-time)
  useEffect(() => {
    const unsub = db.collection('subjects').orderBy('createdAt', 'asc').onSnapshot(
      (snap) => setSubjects(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
      () => setError('Could not load subjects. Check your Firestore setup.')
    );
    return unsub;
  }, []);

  // Scores (real-time, for the signed-in student)
  useEffect(() => {
    if (!authUser || isAdmin) { setScores({}); return; }
    const unsub = db.collection('scores').doc(authUser.uid).onSnapshot(
      (doc) => setScores(doc.exists ? doc.data() : {}),
      () => {}
    );
    return unsub;
  }, [authUser, isAdmin]);

  function resetToLanding() {
    setScreen('landing');
    setSelectedSubjectId(null);
    setEditingChapter(null);
    setStuSubjectId(null);
    setStuChapterId(null);
    setQuizAnswers({});
    setQuizResult(null);
    setAuthError('');
    setAdminError('');
    setAdminPassInput('');
  }

  async function logout() {
    await auth.signOut();
    resetToLanding();
  }

  // ---------- Admin actions ----------
  async function addSubject() {
    const name = newSubjectName.trim();
    if (!name) return;
    try {
      const ref = await db.collection('subjects').add({
        name,
        color: SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length],
        chapters: [],
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      setNewSubjectName('');
      setSelectedSubjectId(ref.id);
    } catch (e) {
      setError('Could not add subject. Check your Firestore rules.');
    }
  }

  async function deleteSubject(id) {
    try {
      await db.collection('subjects').doc(id).delete();
      if (selectedSubjectId === id) setSelectedSubjectId(null);
    } catch (e) {
      setError('Could not delete subject.');
    }
  }

  async function saveChapter(subjectId, chapter) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    const exists = subject.chapters.some(c => c.id === chapter.id);
    const chapters = exists ? subject.chapters.map(c => c.id === chapter.id ? chapter : c) : [...subject.chapters, chapter];
    try {
      await db.collection('subjects').doc(subjectId).update({ chapters });
      setEditingChapter(null);
    } catch (e) {
      setError('Could not save chapter.');
    }
  }

  async function deleteChapter(subjectId, chapterId) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;
    try {
      await db.collection('subjects').doc(subjectId).update({ chapters: subject.chapters.filter(c => c.id !== chapterId) });
    } catch (e) {
      setError('Could not delete chapter.');
    }
  }

  // ---------- Student auth ----------
  async function handleSignup() {
    setAuthError('');
    const username = authForm.username.trim();
    const password = authForm.password;
    if (!username || !password) { setAuthError('Enter a username and password.'); return; }
    try {
      const cred = await auth.createUserWithEmailAndPassword(usernameToEmail(username), password);
      await db.collection('profiles').doc(cred.user.uid).set({ username });
      setAuthForm({ username: '', password: '' });
    } catch (e) {
      setAuthError(friendlyAuthError(e));
    }
  }

  async function handleLogin() {
    setAuthError('');
    const username = authForm.username.trim();
    const password = authForm.password;
    if (!username || !password) { setAuthError('Enter a username and password.'); return; }
    try {
      await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
      setAuthForm({ username: '', password: '' });
    } catch (e) {
      setAuthError(friendlyAuthError(e));
    }
  }

  async function handleAdminLogin() {
    setAdminError('');
    try {
      await auth.signInWithEmailAndPassword(ADMIN_EMAIL, adminPassInput);
    } catch (e) {
      setAdminError(friendlyAuthError(e));
    }
  }

  async function submitQuiz(chapter) {
    const mcqs = chapter.mcqs || [];
    let correctCount = 0;
    mcqs.forEach(q => { if (quizAnswers[q.id] === q.correct) correctCount += 1; });
    const result = { score: correctCount, total: mcqs.length };
    setQuizResult(result);
    try {
      await db.collection('scores').doc(authUser.uid).set(
        { [chapter.id]: { score: correctCount, total: mcqs.length, date: new Date().toISOString() } },
        { merge: true }
      );
    } catch (e) { /* non-fatal */ }
  }

  // ---------- Render ----------
  if (authUser === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F6F5F1' }}>
        <div className="sl-mono text-sm" style={{ color: '#1E4B3E' }}>Loading…</div>
      </div>
    );
  }

  if (!authUser) {
    if (screen === 'adminLogin') {
      return <AdminLogin value={adminPassInput} onChange={setAdminPassInput} onBack={resetToLanding} onSubmit={handleAdminLogin} error={adminError} />;
    }
    if (screen === 'studentAuth') {
      return <StudentAuth mode={authMode} setMode={setAuthMode} form={authForm} setForm={setAuthForm} error={authError} onBack={resetToLanding} onSubmit={authMode === 'login' ? handleLogin : handleSignup} />;
    }
    return <Landing onAdmin={() => setScreen('adminLogin')} onStudent={() => setScreen('studentAuth')} />;
  }

  if (isAdmin) {
    const subject = subjects.find(s => s.id === selectedSubjectId) || null;
    return (
      <AdminDashboard
        subjects={subjects}
        subject={subject}
        selectedSubjectId={selectedSubjectId}
        setSelectedSubjectId={setSelectedSubjectId}
        newSubjectName={newSubjectName}
        setNewSubjectName={setNewSubjectName}
        addSubject={addSubject}
        deleteSubject={deleteSubject}
        editingChapter={editingChapter}
        setEditingChapter={setEditingChapter}
        saveChapter={saveChapter}
        deleteChapter={deleteChapter}
        onLogout={logout}
        error={error}
      />
    );
  }

  // student, signed in
  const subject = subjects.find(s => s.id === stuSubjectId) || null;
  const chapter = subject ? subject.chapters.find(c => c.id === stuChapterId) : null;
  return (
    <StudentDashboard
      subjects={subjects}
      scores={scores}
      username={profileUsername}
      subject={subject}
      chapter={chapter}
      setStuSubjectId={(id) => { setStuSubjectId(id); setStuChapterId(null); setQuizResult(null); setQuizAnswers({}); }}
      setStuChapterId={(id) => { setStuChapterId(id); setQuizResult(null); setQuizAnswers({}); }}
      quizAnswers={quizAnswers}
      setQuizAnswers={setQuizAnswers}
      quizResult={quizResult}
      setQuizResult={setQuizResult}
      submitQuiz={submitQuiz}
      onLogout={logout}
    />
  );
}

// ================= Landing =================
function Landing({ onAdmin, onStudent }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: '#F6F5F1' }}>
      <div className="mb-10 text-center">
        <div className="sl-mono text-xs mb-3" style={{ color: '#B98B2A' }}>A PLACE FOR CHAPTERS &amp; QUIZZES</div>
        <h1 className="sl-display text-5xl md:text-6xl" style={{ color: '#1B1B1B' }}>Study Ledger</h1>
      </div>
      <div className="flex flex-col sm:flex-row gap-5 w-full max-w-xl">
        <button onClick={onAdmin} className="sl-card flex-1 rounded-sm p-7 text-left transition hover:-translate-y-0.5" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>
          <div className="sl-display text-2xl mt-2">Teacher</div>
          <div className="sl-body text-sm mt-1 opacity-80">Add subjects, chapters, notes and quizzes.</div>
        </button>
        <button onClick={onStudent} className="sl-card flex-1 rounded-sm p-7 text-left bg-white transition hover:-translate-y-0.5" style={{ color: '#1B1B1B', border: '1px solid #E7E4DA' }}>
          <div className="sl-display text-2xl mt-2">Student</div>
          <div className="sl-body text-sm mt-1 opacity-70">Sign in, read chapters, take quizzes.</div>
        </button>
      </div>
    </div>
  );
}

// ================= Admin Login =================
function AdminLogin({ value, onChange, onSubmit, onBack, error }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#F6F5F1' }}>
      <div className="w-full max-w-sm">
        <button onClick={onBack} className="sl-body text-sm mb-6 opacity-60 hover:opacity-100">&larr; Back</button>
        <div className="sl-card bg-white rounded-sm p-8" style={{ border: '1px solid #E7E4DA' }}>
          <div className="sl-display text-2xl mb-5">Teacher sign in</div>
          <label className="sl-mono text-xs block mb-1" style={{ color: '#8A8578' }}>ADMIN PASSWORD</label>
          <input type="password" value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSubmit()}
            className="sl-body w-full px-3 py-2 rounded-sm mb-3 outline-none" style={{ border: '1px solid #D8D4C6' }} autoFocus />
          {error && <div className="sl-body text-sm mb-3" style={{ color: '#A63446' }}>{error}</div>}
          <button onClick={onSubmit} className="sl-body w-full py-2.5 rounded-sm text-sm font-medium" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>Enter dashboard</button>
        </div>
      </div>
    </div>
  );
}

// ================= Admin Dashboard =================
function AdminDashboard(props) {
  const { subjects, subject, selectedSubjectId, setSelectedSubjectId, newSubjectName, setNewSubjectName, addSubject, deleteSubject, editingChapter, setEditingChapter, saveChapter, deleteChapter, onLogout, error } = props;
  return (
    <div className="min-h-screen" style={{ background: '#F6F5F1' }}>
      <TopBar tag="Teacher dashboard" onLogout={onLogout} />
      {error && <div className="sl-body text-sm px-6 py-2" style={{ color: '#A63446' }}>{error}</div>}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
        <div>
          <div className="sl-mono text-xs mb-3" style={{ color: '#8A8578' }}>SUBJECTS</div>
          <div className="flex flex-col gap-1 mb-4">
            {subjects.map(s => (
              <button key={s.id} onClick={() => setSelectedSubjectId(s.id)} className="sl-body flex items-center justify-between px-3 py-2 rounded-sm text-sm text-left"
                style={{ background: selectedSubjectId === s.id ? '#FFFFFF' : 'transparent', border: selectedSubjectId === s.id ? '1px solid #E7E4DA' : '1px solid transparent' }}>
                <span className="flex items-center gap-2">
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: s.color, display: 'inline-block' }} />
                  {s.name}
                </span>
                <span onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${s.name}" and all its chapters?`)) deleteSubject(s.id); }} style={{ color: '#B0AA98', fontSize: 12 }}>✕</span>
              </button>
            ))}
            {subjects.length === 0 && <div className="sl-body text-sm opacity-50">No subjects yet.</div>}
          </div>
          <div className="flex gap-2">
            <input value={newSubjectName} onChange={e => setNewSubjectName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSubject()}
              placeholder="New subject" className="sl-body flex-1 min-w-0 px-2 py-1.5 rounded-sm text-sm outline-none" style={{ border: '1px solid #D8D4C6' }} />
            <button onClick={addSubject} className="rounded-sm px-3 sl-body text-sm" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>+</button>
          </div>
        </div>

        <div>
          {!subject && <div className="sl-body opacity-50 mt-10 text-center">Select or add a subject to manage its chapters.</div>}
          {subject && !editingChapter && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <h2 className="sl-display text-3xl">{subject.name}</h2>
                <button onClick={() => setEditingChapter({ id: uid(), title: '', note: '', mcqs: [] })}
                  className="sl-body text-sm px-3 py-2 rounded-sm" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>+ New chapter</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {subject.chapters.map((c, i) => (
                  <div key={c.id} className="sl-card bg-white rounded-sm p-4 relative" style={{ borderLeft: `4px solid ${subject.color}` }}>
                    <div className="sl-mono text-xs mb-1" style={{ color: '#B0AA98' }}>CH. {String(i + 1).padStart(2, '0')} · {(c.mcqs || []).length} MCQs</div>
                    <div className="sl-display text-lg mb-2">{c.title || 'Untitled chapter'}</div>
                    <div className="sl-body text-sm opacity-60 mb-3" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.note || 'No notes yet.'}</div>
                    <div className="flex gap-3">
                      <button onClick={() => setEditingChapter(c)} className="sl-body text-xs opacity-70 hover:opacity-100">Edit</button>
                      <button onClick={() => { if (window.confirm('Delete this chapter?')) deleteChapter(subject.id, c.id); }} className="sl-body text-xs" style={{ color: '#A63446' }}>Delete</button>
                    </div>
                  </div>
                ))}
                {subject.chapters.length === 0 && <div className="sl-body opacity-50">No chapters yet — add the first one.</div>}
              </div>
            </div>
          )}
          {subject && editingChapter && (
            <ChapterEditor chapter={editingChapter} onCancel={() => setEditingChapter(null)} onSave={(c) => saveChapter(subject.id, c)} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterEditor({ chapter, onCancel, onSave }) {
  const [title, setTitle] = useState(chapter.title);
  const [note, setNote] = useState(chapter.note);
  const [mcqs, setMcqs] = useState(chapter.mcqs && chapter.mcqs.length ? chapter.mcqs : []);

  function addQuestion() { setMcqs([...mcqs, blankQuestion()]); }
  function updateQuestion(id, patch) { setMcqs(mcqs.map(q => q.id === id ? { ...q, ...patch } : q)); }
  function updateOption(id, idx, value) { setMcqs(mcqs.map(q => q.id === id ? { ...q, options: q.options.map((o, i) => i === idx ? value : o) } : q)); }
  function removeQuestion(id) { setMcqs(mcqs.filter(q => q.id !== id)); }

  function handleSave() {
    if (!title.trim()) { window.alert('Give the chapter a title.'); return; }
    onSave({ ...chapter, title: title.trim(), note, mcqs: mcqs.filter(q => q.q.trim()) });
  }

  return (
    <div className="sl-card bg-white rounded-sm p-6" style={{ border: '1px solid #E7E4DA' }}>
      <label className="sl-mono text-xs block mb-1" style={{ color: '#8A8578' }}>CHAPTER TITLE</label>
      <input value={title} onChange={e => setTitle(e.target.value)} className="sl-body w-full px-3 py-2 rounded-sm mb-4 outline-none" style={{ border: '1px solid #D8D4C6' }} />

      <label className="sl-mono text-xs block mb-1" style={{ color: '#8A8578' }}>SHORT NOTE</label>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={6} className="sl-body w-full px-3 py-2 rounded-sm mb-6 outline-none" style={{ border: '1px solid #D8D4C6' }} />

      <div className="flex items-center justify-between mb-3">
        <label className="sl-mono text-xs" style={{ color: '#8A8578' }}>MCQs</label>
        <button onClick={addQuestion} className="sl-body text-xs px-2 py-1 rounded-sm" style={{ background: '#F6F5F1', border: '1px solid #D8D4C6' }}>+ Add question</button>
      </div>

      <div className="flex flex-col gap-4 mb-6">
        {mcqs.map((q, qi) => (
          <div key={q.id} className="rounded-sm p-4" style={{ background: '#F6F5F1' }}>
            <div className="flex items-start gap-2 mb-2">
              <span className="sl-mono text-xs mt-2" style={{ color: '#B0AA98' }}>Q{qi + 1}</span>
              <input value={q.q} onChange={e => updateQuestion(q.id, { q: e.target.value })} placeholder="Question text"
                className="sl-body flex-1 px-2 py-1.5 rounded-sm outline-none text-sm" style={{ border: '1px solid #D8D4C6' }} />
              <button onClick={() => removeQuestion(q.id)} style={{ color: '#A63446' }}>✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-6">
              {q.options.map((opt, oi) => (
                <label key={oi} className="flex items-center gap-2 text-sm sl-body">
                  <input type="radio" name={`correct-${q.id}`} checked={q.correct === oi} onChange={() => updateQuestion(q.id, { correct: oi })} />
                  <input value={opt} onChange={e => updateOption(q.id, oi, e.target.value)} placeholder={`Option ${oi + 1}`}
                    className="flex-1 px-2 py-1 rounded-sm outline-none" style={{ border: '1px solid #D8D4C6' }} />
                </label>
              ))}
            </div>
          </div>
        ))}
        {mcqs.length === 0 && <div className="sl-body text-sm opacity-50">No questions yet — add one above.</div>}
      </div>

      <div className="flex gap-3">
        <button onClick={handleSave} className="sl-body text-sm px-4 py-2 rounded-sm" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>Save chapter</button>
        <button onClick={onCancel} className="sl-body text-sm px-4 py-2 rounded-sm" style={{ border: '1px solid #D8D4C6' }}>Cancel</button>
      </div>
    </div>
  );
}

// ================= Student Auth =================
function StudentAuth({ mode, setMode, form, setForm, error, onBack, onSubmit }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#F6F5F1' }}>
      <div className="w-full max-w-sm">
        <button onClick={onBack} className="sl-body text-sm mb-6 opacity-60 hover:opacity-100">&larr; Back</button>
        <div className="sl-card bg-white rounded-sm p-8" style={{ border: '1px solid #E7E4DA' }}>
          <div className="sl-display text-2xl mb-5">{mode === 'login' ? 'Student sign in' : 'Create your account'}</div>
          <label className="sl-mono text-xs block mb-1" style={{ color: '#8A8578' }}>USERNAME</label>
          <input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="sl-body w-full px-3 py-2 rounded-sm mb-3 outline-none" style={{ border: '1px solid #D8D4C6' }} />
          <label className="sl-mono text-xs block mb-1" style={{ color: '#8A8578' }}>PASSWORD</label>
          <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} onKeyDown={e => e.key === 'Enter' && onSubmit()}
            className="sl-body w-full px-3 py-2 rounded-sm mb-3 outline-none" style={{ border: '1px solid #D8D4C6' }} />
          {error && <div className="sl-body text-sm mb-3" style={{ color: '#A63446' }}>{error}</div>}
          <button onClick={onSubmit} className="sl-body w-full py-2.5 rounded-sm text-sm font-medium mb-3" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>
            {mode === 'login' ? 'Sign in' : 'Sign up'}
          </button>
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="sl-body w-full text-xs opacity-60 hover:opacity-100">
            {mode === 'login' ? "No account yet? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ================= Student Dashboard =================
function StudentDashboard(props) {
  const { subjects, scores, username, subject, chapter, setStuSubjectId, setStuChapterId, quizAnswers, setQuizAnswers, quizResult, setQuizResult, submitQuiz, onLogout } = props;
  return (
    <div className="min-h-screen" style={{ background: '#F6F5F1' }}>
      <TopBar tag={`Signed in as ${username}`} onLogout={onLogout} />
      <div className="max-w-5xl mx-auto px-6 py-8">
        {!subject && (
          <div>
            <div className="sl-mono text-xs mb-4" style={{ color: '#8A8578' }}>SUBJECTS</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {subjects.map(s => (
                <button key={s.id} onClick={() => setStuSubjectId(s.id)} className="sl-card bg-white rounded-sm p-5 text-left" style={{ borderTop: `4px solid ${s.color}` }}>
                  <div className="sl-display text-xl mt-1">{s.name}</div>
                  <div className="sl-body text-xs opacity-50 mt-1">{s.chapters.length} chapter{s.chapters.length !== 1 ? 's' : ''}</div>
                </button>
              ))}
              {subjects.length === 0 && <div className="sl-body opacity-50">No subjects have been added yet. Check back soon.</div>}
            </div>
          </div>
        )}

        {subject && !chapter && (
          <div>
            <button onClick={() => setStuSubjectId(null)} className="sl-body text-sm mb-5 opacity-60 hover:opacity-100">&larr; All subjects</button>
            <h2 className="sl-display text-3xl mb-5">{subject.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {subject.chapters.map((c, i) => {
                const rec = scores[c.id];
                return (
                  <button key={c.id} onClick={() => setStuChapterId(c.id)} className="sl-card bg-white rounded-sm p-4 text-left relative" style={{ borderLeft: `4px solid ${subject.color}` }}>
                    <div className="sl-mono text-xs mb-1" style={{ color: '#B0AA98' }}>CH. {String(i + 1).padStart(2, '0')}</div>
                    <div className="sl-display text-lg mb-1">{c.title}</div>
                    <div className="sl-body text-xs opacity-60">{(c.mcqs || []).length} MCQs</div>
                    {rec && <div className="sl-mono text-xs mt-2" style={{ color: '#1E4B3E' }}>SCORE {rec.score}/{rec.total}</div>}
                  </button>
                );
              })}
              {subject.chapters.length === 0 && <div className="sl-body opacity-50">No chapters in this subject yet.</div>}
            </div>
          </div>
        )}

        {subject && chapter && (
          <ChapterView subject={subject} chapter={chapter} onBack={() => setStuChapterId(null)}
            quizAnswers={quizAnswers} setQuizAnswers={setQuizAnswers} quizResult={quizResult} setQuizResult={setQuizResult}
            onSubmit={() => submitQuiz(chapter)} priorScore={scores[chapter.id]} />
        )}
      </div>
    </div>
  );
}

function ChapterView({ subject, chapter, onBack, quizAnswers, setQuizAnswers, quizResult, setQuizResult, onSubmit, priorScore }) {
  const [showQuiz, setShowQuiz] = useState(false);
  const mcqs = chapter.mcqs || [];
  return (
    <div>
      <button onClick={onBack} className="sl-body text-sm mb-5 opacity-60 hover:opacity-100">&larr; {subject.name}</button>
      {!showQuiz && (
        <div className="sl-card bg-white rounded-sm p-6" style={{ borderLeft: `4px solid ${subject.color}` }}>
          <div className="sl-mono text-xs mb-1" style={{ color: '#B0AA98' }}>{subject.name.toUpperCase()}</div>
          <h2 className="sl-display text-3xl mb-4">{chapter.title}</h2>
          <p className="sl-body opacity-80 leading-relaxed mb-6" style={{ whiteSpace: 'pre-wrap' }}>{chapter.note || 'No notes for this chapter yet.'}</p>
          {mcqs.length > 0 && (
            <button onClick={() => { setShowQuiz(true); setQuizResult(null); setQuizAnswers({}); }} className="sl-body text-sm px-4 py-2 rounded-sm" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>
              {priorScore ? 'Retake quiz' : 'Start quiz'} ({mcqs.length} MCQs)
            </button>
          )}
        </div>
      )}
      {showQuiz && !quizResult && (
        <div className="sl-card bg-white rounded-sm p-6">
          <h2 className="sl-display text-2xl mb-5">{chapter.title} — Quiz</h2>
          <div className="flex flex-col gap-5 mb-6">
            {mcqs.map((q, qi) => (
              <div key={q.id}>
                <div className="sl-body text-sm font-medium mb-2">{qi + 1}. {q.q}</div>
                <div className="flex flex-col gap-1.5 ml-2">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className="flex items-center gap-2 text-sm sl-body">
                      <input type="radio" name={`ans-${q.id}`} checked={quizAnswers[q.id] === oi} onChange={() => setQuizAnswers({ ...quizAnswers, [q.id]: oi })} />
                      {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={onSubmit} className="sl-body text-sm px-4 py-2 rounded-sm" style={{ background: '#1E4B3E', color: '#F6F5F1' }}>Submit answers</button>
        </div>
      )}
      {showQuiz && quizResult && (
        <div className="sl-card bg-white rounded-sm p-6">
          <div className="sl-mono text-xs mb-1" style={{ color: '#8A8578' }}>RESULT</div>
          <div className="sl-display text-4xl mb-5" style={{ color: '#1E4B3E' }}>{quizResult.score} / {quizResult.total}</div>
          <div className="flex flex-col gap-3 mb-6">
            {mcqs.map((q, qi) => {
              const chosen = quizAnswers[q.id];
              const isCorrect = chosen === q.correct;
              return (
                <div key={q.id} className="text-sm sl-body">
                  <div className="mb-1" style={{ color: isCorrect ? '#1E4B3E' : '#A63446' }}>{isCorrect ? '✓' : '✗'} <span style={{ color: '#1B1B1B' }}>{qi + 1}. {q.q}</span></div>
                  <div className="ml-5 opacity-70">Your answer: {chosen === undefined ? '—' : q.options[chosen]}{!isCorrect && <span> · Correct: {q.options[q.correct]}</span>}</div>
                </div>
              );
            })}
          </div>
          <button onClick={() => setShowQuiz(false)} className="sl-body text-sm px-4 py-2 rounded-sm" style={{ border: '1px solid #D8D4C6' }}>Back to chapter</button>
        </div>
      )}
    </div>
  );
}

// ================= Shared =================
function TopBar({ tag, onLogout }) {
  return (
    <div className="flex items-center justify-between px-6 py-4" style={{ background: '#1E4B3E' }}>
      <div>
        <div className="sl-display text-lg" style={{ color: '#F6F5F1' }}>Study Ledger</div>
        <div className="sl-mono text-xs" style={{ color: '#B98B2A' }}>{tag}</div>
      </div>
      <button onClick={onLogout} className="sl-body text-xs px-3 py-1.5 rounded-sm" style={{ background: 'rgba(255,255,255,0.1)', color: '#F6F5F1' }}>Log out</button>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
