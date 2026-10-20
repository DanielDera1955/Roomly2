import React, { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, ChevronUp } from 'lucide-react';
import { subscribeMessages, sendMessage } from '../api.js';
import { playChime } from '../sound';

interface OrderChatProps {
  orderId: string;
  role: 'customer' | 'runner' | 'admin';
  senderName: string;
  closed?: boolean;
  defaultOpen?: boolean;
  title?: string;
}

/** Chat thread attached to one order (customer, runner and admin can all post). */
export const OrderChat: React.FC<OrderChatProps> = ({
  orderId,
  role,
  senderName,
  closed = false,
  defaultOpen = false,
  title,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<any[]>([]);
  const [unread, setUnread] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(open);
  const countRef = useRef<number | null>(null);
  openRef.current = open;

  // Listen even while collapsed so a new message can ring and show a dot
  useEffect(() => {
    countRef.current = null;
    return subscribeMessages(orderId, (list: any[]) => {
      if (countRef.current !== null && list.length > countRef.current) {
        const last = list[list.length - 1];
        if (last && last.sender !== role) {
          playChime('chat');
          if (!openRef.current) setUnread(true);
        }
      }
      countRef.current = list.length;
      setMessages(list);
    });
  }, [orderId, role]);

  useEffect(() => {
    if (open) {
      setUnread(false);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(orderId, role, senderName, t);
      setText('');
    } catch (err) {
      setError('Message not sent. Try again.');
    }
    setSending(false);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-100 cursor-pointer"
      >
        <span className="flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4 text-[#0e9f55]" />
          {title || (role === 'customer' ? 'Chat with your runner' : 'Chat with customer')}
          {unread && <span className="w-2 h-2 rounded-full bg-rose-500" />}
        </span>
        <ChevronUp className={`w-4 h-4 transition-transform ${open ? '' : 'rotate-180'}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          <div className="max-h-56 overflow-y-auto p-3 space-y-2 bg-slate-50 dark:bg-slate-950/40">
            {messages.length === 0 && (
              <p className="text-[11px] text-center text-slate-400 py-3">No messages yet.</p>
            )}
            {messages.map((m) => {
              const mine = m.sender === role;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-xs ${
                      mine
                        ? 'bg-[#0e9f55] text-white rounded-br-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-bl-sm'
                    }`}
                  >
                    {!mine && (
                      <span className="block text-[10px] font-bold opacity-70">
                        {m.sender === 'customer' ? m.name || 'Customer' : `${m.name || m.sender} (${m.sender})`}
                      </span>
                    )}
                    <span className="whitespace-pre-wrap break-words">{m.text}</span>
                    <span className={`block text-[9px] mt-0.5 ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                      {m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                    </span>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {closed ? (
            <p className="text-[11px] text-center text-slate-400 py-2">This order is complete. Chat is closed.</p>
          ) : (
            <form onSubmit={send} className="flex items-center gap-2 p-2 border-t border-slate-100 dark:border-slate-800">
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 500))}
                placeholder="Type a message"
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0e9f55]/30"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="p-2 rounded-xl bg-[#0e9f55] text-white disabled:opacity-50 cursor-pointer"
                aria-label="Send"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          )}
          {error && <p className="text-[11px] text-rose-500 px-3 pb-2">{error}</p>}
        </div>
      )}
    </div>
  );
};
