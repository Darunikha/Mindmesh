import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Brain, LibraryBig, MessagesSquare, Sparkles } from 'lucide-react';
import Composer, { CHAT_MODES } from '../../components/chat/Composer.jsx';
import ConversationList from '../../components/chat/ConversationList.jsx';
import MessageItem from '../../components/chat/MessageItem.jsx';
import SetupNotice from '../../components/chat/SetupNotice.jsx';
import Button from '../../components/ui/Button.jsx';
import Alert from '../../components/ui/Alert.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import { aiApi, conversationsApi } from '../../api/chat.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useTheme } from '../../context/ThemeContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { THEMES } from '../../themes/registry.js';
import { firstName } from '../../lib/format.js';
import { cn } from '../../lib/cn.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

function suggestions(mode, interests) {
  const topics = interests.slice(0, 2);
  if (mode === 'knowledge') {
    return [
      'Summarise the key ideas across my saved notes',
      topics[0] ? `What do my sources say about ${topics[0].toLowerCase()}?` : 'What are the main themes in my documents?',
      'Which of my notes mention open questions or to-dos?',
    ];
  }
  return [
    topics[0] ? `Explain the core concepts of ${topics[0].toLowerCase()} simply` : 'Explain how neural networks learn, simply',
    'Brainstorm ten angles for an essay on attention spans',
    'Write a Python function that deduplicates a list while keeping order',
    topics[1] ? `Compare two schools of thought in ${topics[1].toLowerCase()}` : 'Compare SQL and NoSQL databases in a table',
  ];
}

export default function AssistantPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { theme } = useTheme();
  const toast = useToast();
  const prefMode = user.preferences?.ai?.defaultMode === 'general' ? 'general' : 'knowledge';

  const [status, setStatus] = useState(null);
  const [conversations, setConversations] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadState, setLoadState] = useState('idle');
  const [mode, setMode] = useState(prefMode);
  const [stream, setStream] = useState(null); // { assistantId, phase }
  const [sendError, setSendError] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [listOpen, setListOpen] = useState(false);

  const abortRef = useRef(null);
  const createdRef = useRef(null);
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const pending = useRef('');
  const raf = useRef(0);
  const asstIdRef = useRef(null);
  const autoSent = useRef(false);

  const chatReady = status?.chat?.configured;

  const refreshStatus = useCallback(() => aiApi.status().then(setStatus).catch(() => setStatus({ chat: { configured: false } })), []);
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const loadList = useCallback(() => conversationsApi.list().then((d) => setConversations(d.conversations)).catch(() => setConversations([])), []);
  useEffect(() => {
    loadList();
  }, [loadList]);

  // Load the selected conversation (skip the one we just created locally).
  useEffect(() => {
    setSendError(null);
    if (!id) {
      setConversation(null);
      setMessages([]);
      setMode(prefMode);
      setLoadState('idle');
      return undefined;
    }
    if (createdRef.current === id) {
      createdRef.current = null;
      setLoadState('ready');
      return undefined;
    }
    let alive = true;
    setLoadState('loading');
    conversationsApi
      .get(id)
      .then((d) => {
        if (!alive) return;
        setConversation(d.conversation);
        setMessages(d.messages);
        setMode(d.conversation.mode);
        setLoadState('ready');
        stickToBottom.current = true;
      })
      .catch((err) => alive && setLoadState(err.status === 404 ? 'notfound' : 'error'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Abort an in-flight stream when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the view pinned to the newest message unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages, stream]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };

  const flush = useCallback(() => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    if (!pending.current) return;
    const text = pending.current;
    pending.current = '';
    const target = asstIdRef.current;
    setMessages((ms) => ms.map((m) => (m.id === target ? { ...m, content: m.content + text } : m)));
  }, []);

  const runStream = useCallback(
    async (convId, request, { userText, regenerate, streamMode }) => {
      const controller = new AbortController();
      abortRef.current = controller;
      const tmpUser = `tmp-u-${uuid()}`;
      const tmpAsst = `tmp-a-${uuid()}`;
      asstIdRef.current = tmpAsst;
      const now = new Date().toISOString();
      setSendError(null);
      stickToBottom.current = true;
      setMessages((ms) => [
        ...ms,
        ...(regenerate ? [] : [{ id: tmpUser, role: 'user', content: userText, mode: streamMode, createdAt: now }]),
        { id: tmpAsst, role: 'assistant', kind: 'message', mode: streamMode, content: '', status: 'streaming', citations: [], followUps: [], createdAt: now },
      ]);
      setStream({ assistantId: tmpAsst, phase: streamMode === 'knowledge' ? 'searching' : 'thinking' });

      const patch = (fn) => {
        const target = asstIdRef.current;
        setMessages((ms) => ms.map((m) => (m.id === target ? fn(m) : m)));
      };
      let started = false;

      try {
        await request({
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === 'start') {
              started = true;
              asstIdRef.current = data.assistantMessage.id;
              setMessages((ms) =>
                ms.map((m) => (m.id === tmpUser ? data.userMessage : m.id === tmpAsst ? { ...m, id: data.assistantMessage.id, createdAt: data.assistantMessage.createdAt } : m))
              );
              setStream((s) => ({ ...s, assistantId: data.assistantMessage.id }));
            } else if (event === 'status') {
              setStream((s) => (s ? { ...s, phase: data.phase } : s));
            } else if (event === 'sources') {
              patch((m) => ({ ...m, retrieval: data.retrieval }));
            } else if (event === 'delta') {
              pending.current += data.text;
              if (!raf.current) raf.current = requestAnimationFrame(flush);
            } else if (event === 'done') {
              flush();
              patch(() => data.message);
              setStream(null);
            } else if (event === 'meta') {
              if (data.followUps?.length) setMessages((ms) => ms.map((m) => (m.id === data.messageId ? { ...m, followUps: data.followUps } : m)));
              if (data.conversation) {
                setConversation(data.conversation);
                setConversations((cs) => (cs || []).map((c) => (c.id === data.conversation.id ? data.conversation : c)));
              }
            } else if (event === 'error') {
              flush();
              patch((m) => ({ ...m, status: 'error', error: data.message, errorCode: data.code }));
              setStream(null);
            }
          },
        });
      } catch (err) {
        flush();
        if (err.name === 'AbortError') {
          patch((m) => ({ ...m, status: 'stopped' }));
        } else if (!started) {
          // Nothing reached the server's conversation: roll back the optimistic messages.
          setMessages((ms) => ms.filter((m) => m.id !== tmpUser && m.id !== tmpAsst));
          if (err.code === 'AI_NOT_CONFIGURED') refreshStatus();
          else setSendError({ message: err.message, text: userText });
        } else {
          patch((m) => ({ ...m, status: 'error', error: err.message }));
        }
      } finally {
        flush();
        setStream(null);
        abortRef.current = null;
        setConversations((cs) => {
          if (!cs) return cs;
          const current = cs.find((c) => c.id === convId);
          return current ? [{ ...current, lastMessageAt: new Date().toISOString(), mode: streamMode }, ...cs.filter((c) => c.id !== convId)] : cs;
        });
      }
    },
    [flush, refreshStatus]
  );

  const send = useCallback(
    async (text, modeOverride) => {
      if (stream || !chatReady) return;
      const useMode = modeOverride || mode;
      let convId = id;
      if (!convId) {
        try {
          const { conversation: created } = await conversationsApi.create({ mode: useMode });
          convId = created.id;
          createdRef.current = convId;
          setConversation(created);
          setConversations((cs) => [created, ...(cs || [])]);
          navigate(`/assistant/${convId}`);
        } catch (err) {
          setSendError({ message: err.message, text });
          return;
        }
      }
      await runStream(convId, (opts) => conversationsApi.send(convId, { content: text, mode: useMode, clientRequestId: uuid() }, opts), { userText: text, streamMode: useMode });
    },
    [stream, chatReady, mode, id, navigate, runStream]
  );

  const regenerate = useCallback(
    (message) => {
      if (stream || !conversation) return;
      setMessages((ms) => ms.filter((m) => m.id !== message.id));
      runStream(conversation.id, (opts) => conversationsApi.regenerate(conversation.id, message.id, { mode }, opts), { regenerate: true, streamMode: mode });
    },
    [stream, conversation, mode, runStream]
  );

  // A prompt handed over from the Home page is sent once, as soon as chat is ready.
  useEffect(() => {
    const prompt = location.state?.prompt;
    if (!prompt || autoSent.current || !chatReady || id) return;
    autoSent.current = true;
    if (location.state?.mode) setMode(location.state.mode);
    navigate(location.pathname, { replace: true, state: null });
    send(prompt, location.state?.mode);
  }, [location, chatReady, id, navigate, send]);

  const changeMode = (m) => {
    setMode(m);
    if (conversation) conversationsApi.update(conversation.id, { mode: m }).catch(() => {});
  };

  const rename = async (cid, title) => {
    try {
      const { conversation: updated } = await conversationsApi.update(cid, { title });
      setConversations((cs) => cs.map((c) => (c.id === cid ? updated : c)));
      if (conversation?.id === cid) setConversation(updated);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const confirmDelete = async () => {
    const target = toDelete;
    setToDelete(null);
    try {
      await conversationsApi.remove(target.id);
      setConversations((cs) => cs.filter((c) => c.id !== target.id));
      if (target.id === id) navigate('/assistant');
      toast.success('Conversation deleted');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === 'assistant'), [messages]);
  const modeInfo = CHAT_MODES.find((m) => m.value === mode);

  return (
    <div className="-my-4 grid h-[calc(100dvh-7.5rem)] gap-6 lg:-my-4 lg:h-[calc(100dvh-4.5rem)] lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Conversation history */}
      <aside className={cn('min-h-0 lg:block', listOpen ? 'fixed inset-0 z-40 bg-bg p-4 lg:static lg:bg-transparent lg:p-0' : 'hidden')} aria-label="Chat history">
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <p className="mm-eyebrow">Chats</p>
          <Button variant="ghost" size="sm" onClick={() => setListOpen(false)}>
            Close
          </Button>
        </div>
        <ConversationList
          conversations={conversations}
          loading={conversations === null}
          onNew={() => {
            setListOpen(false);
            navigate('/assistant');
          }}
          onRename={rename}
          onDelete={setToDelete}
          onNavigate={() => setListOpen(false)}
        />
      </aside>

      {/* Thread */}
      <section className="flex min-h-0 min-w-0 flex-col" aria-label="Conversation">
        <header className="mb-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" icon={MessagesSquare} className="lg:hidden" onClick={() => setListOpen(true)}>
            Chats
          </Button>
          <div className="min-w-0 flex-1">
            <p className="mm-eyebrow">{theme === 'library' ? 'The Reading Room' : theme === 'lab' ? '01 / Core · assistant' : 'Assistant'}</p>
            <h1 className="truncate font-display text-xl text-ink sm:text-2xl library:text-3xl">{conversation?.title || 'New conversation'}</h1>
          </div>
        </header>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto pr-1" aria-live="polite" aria-relevant="additions">
          {loadState === 'loading' && (
            <div className="space-y-6 py-4">
              <Skeleton className="ml-auto h-12 w-2/3" />
              <Skeleton lines={5} />
            </div>
          )}
          {loadState === 'notfound' && (
            <EmptyState icon={MessagesSquare} title="Conversation not found" action={<Button onClick={() => navigate('/assistant')}>Start a new chat</Button>}>
              It may have been deleted.
            </EmptyState>
          )}
          {loadState === 'error' && <Alert tone="error">Could not load this conversation.</Alert>}

          {(loadState === 'idle' || loadState === 'ready') && messages.length === 0 && (
            <div className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent lab:rounded-[8px]">
                <Sparkles size={22} aria-hidden />
              </span>
              <h2 className="mm-display mt-4 text-3xl text-ink library:text-4xl">
                What shall we explore, <em>{firstName(user.name)}</em>?
              </h2>
              <p className="mt-2 max-w-md font-ui text-sm text-ink-muted">
                Ask {THEMES[theme].assistantName} anything.{' '}
                {mode === 'knowledge' ? (
                  <>
                    <LibraryBig size={13} className="inline align-[-2px]" aria-hidden /> <strong>My Knowledge</strong> searches your Vault and cites what it finds.
                  </>
                ) : (
                  <>
                    <Brain size={13} className="inline align-[-2px]" aria-hidden /> <strong>General AI</strong> answers from the model’s own knowledge.
                  </>
                )}
              </p>
              {chatReady && (
                <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                  {suggestions(mode, user.interests || []).map((s) => (
                    <button key={s} type="button" onClick={() => send(s)} className="mm-card mm-card-interactive p-3 text-left font-ui text-sm text-ink-muted hover:text-ink">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-6 pb-4">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                streaming={stream?.assistantId === m.id}
                phase={stream?.assistantId === m.id ? stream.phase : null}
                isLast={m.id === lastAssistant?.id}
                canRegenerate={Boolean(chatReady) && !stream && m.id === lastAssistant?.id && m.kind !== 'notice' && messages.at(-1)?.id === m.id && !m.id.startsWith('tmp-')}
                onRegenerate={() => regenerate(m)}
                onFollowUp={(f) => send(f)}
              />
            ))}
          </div>
        </div>

        <div className="pt-3">
          {sendError && (
            <Alert tone="error" className="mb-3">
              {sendError.message}{' '}
              <button type="button" className="font-semibold underline" onClick={() => send(sendError.text)}>
                Try again
              </button>
            </Alert>
          )}
          {status && !chatReady ? (
            <SetupNotice status={status} />
          ) : (
            <Composer
              key={id || 'new'}
              onSend={send}
              onStop={() => abortRef.current?.abort()}
              streaming={Boolean(stream)}
              disabled={!status}
              mode={mode}
              onModeChange={changeMode}
              placeholder={mode === 'knowledge' ? 'Ask about your notes, documents and links…' : 'Ask anything…'}
            />
          )}
          <p className="mt-2 text-center font-ui text-[0.7rem] text-ink-faint">
            {modeInfo.hint} AI can make mistakes. Check important information.
          </p>
        </div>
      </section>

      <Dialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        tone="danger"
        title="Delete this conversation?"
        description={toDelete ? `“${toDelete.title}” and all its messages will be permanently deleted.` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}
