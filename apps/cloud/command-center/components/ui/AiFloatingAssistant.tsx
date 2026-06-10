"use client";

import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, X, Bot, RefreshCw, ChevronDown, ChevronUp, Link as LinkIcon } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: {
    entity_type: string;
    entity_id: string;
    title: string;
    similarity: number;
  }[];
}

export function AiFloatingAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I am **EventX**, your semantic event assistant. Ask me anything about events, sessions, tracks, or speakers." }
  ]);
  const [inputVal, setInputVal] = useState("");
  const [sending, setSending] = useState(false);
  const [openCitationsIdx, setOpenCitationsIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const token = typeof window !== "undefined" ? (localStorage.getItem("eventos_original_token") || localStorage.getItem("eventos_token") || "") : "";

  useEffect(() => {
    if (isOpen && !conversationId && token) {
      initConversation();
    }
  }, [isOpen, conversationId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, sending]);

  const initConversation = async () => {
    try {
      const savedConv = sessionStorage.getItem("eventos_ai_conv");
      if (savedConv) {
        setConversationId(savedConv);
        // Load messages history
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/ai/conversations/${savedConv}/messages`,
          { headers: { "Authorization": `Bearer ${token}` } }
        );
        if (res.ok) {
          const history = await res.json();
          if (history.length > 0) {
            setMessages(history);
          }
        }
        return;
      }

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/ai/conversations`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        }
      );
      if (res.ok) {
        const data = await res.json();
        setConversationId(data.conversation_id);
        sessionStorage.setItem("eventos_ai_conv", data.conversation_id);
      }
    } catch (err) {
      console.error("AI Conversation init error:", err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || sending || !conversationId) return;

    const userText = inputVal.trim();
    setMessages(prev => [...prev, { role: "user", content: userText }]);
    setInputVal("");
    setSending(true);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/ai/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ message: userText })
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.content,
          citations: data.citations
        }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: "I encountered an error processing your query. Please confirm your API key and try again." }]);
      }
    } catch (err) {
      console.error("AI response error:", err);
      setMessages(prev => [...prev, { role: "assistant", content: "Network error. Make sure the backend server is running." }]);
    } finally {
      setSending(false);
    }
  };

  const toggleCitations = (idx: number) => {
    setOpenCitationsIdx(openCitationsIdx === idx ? null : idx);
  };

  const triggerReindexing = async () => {
    try {
      setMessages(prev => [...prev, { role: "assistant", content: "_Indexing organization schedules & speakers, please wait..._" }]);
      setSending(true);
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/ai/index`,
        {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` }
        }
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, { role: "assistant", content: `✅ Semantic database updated. Indexed **${data.indexed_entities}** entities successfully.` }]);
      }
    } catch (e) {
      console.error("Reindexing error:", e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end">
      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="w-[380px] h-[520px] rounded-2xl border border-default bg-[color-mix(in_srgb,var(--surf)_92%,transparent)] backdrop-blur-xl shadow-2xl flex flex-col mb-4 overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="p-4 border-b border-default/20 bg-card/60 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-[var(--pri)]/10 flex items-center justify-center border border-[var(--pri)]/30">
                <Bot className="h-4 w-4 text-[var(--pri)]" />
              </div>
              <div>
                <h4 className="text-xs font-black text-[var(--text)] tracking-wider uppercase">EventX AI</h4>
                <p className="text-[9px] text-green-400 font-bold uppercase tracking-widest mt-0.5">RAG Assistant Active</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={triggerReindexing}
                className="p-1 rounded hover:bg-card/80 text-muted hover:text-text transition-all"
                title="Re-index organizational knowledge"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-card/80 text-muted hover:text-text transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar text-sm">
            {messages.map((msg, idx) => (
              <div 
                key={idx}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className={`max-w-[85%] px-4 py-3 rounded-2xl font-medium leading-relaxed ${msg.role === 'user' ? 'bg-[var(--pri)] text-white rounded-tr-none' : 'bg-card border border-default/20 text-[var(--text)] rounded-tl-none'}`}>
                  {msg.content}
                </div>
                
                {/* Citations dropdown */}
                {msg.citations && msg.citations.length > 0 && (
                  <div className="mt-1.5 w-full max-w-[85%]">
                    <button 
                      onClick={() => toggleCitations(idx)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--pri)] uppercase tracking-wider hover:opacity-85"
                    >
                      Sources & Citations ({msg.citations.length})
                      {openCitationsIdx === idx ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {openCitationsIdx === idx && (
                      <div className="mt-1 bg-card/60 rounded-lg border border-default/15 p-2 space-y-1.5 animate-in slide-in-from-top-1 duration-200">
                        {msg.citations.map((c, cIdx) => (
                          <div key={cIdx} className="flex items-start gap-1.5 text-[10px] text-muted">
                            <LinkIcon className="h-3 w-3 text-[var(--pri)] shrink-0 mt-0.5" />
                            <div>
                              <p className="font-bold text-[var(--text)]">{c.title} <span className="text-[9px] uppercase bg-card p-0.5 rounded text-muted ml-1 font-black">{c.entity_type}</span></p>
                              <p className="text-[9px] mt-0.5">Similarity match: {intPercent(c.similarity)}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-xs text-muted font-semibold">
                <Bot className="h-4 w-4 animate-bounce text-[var(--pri)]" />
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Form Input */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-default/20 bg-card/40 flex items-center gap-2">
            <input 
              type="text" 
              placeholder="Ask about schedule, speakers, presentations..."
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              className="flex-1 px-4 py-2.5 rounded-xl border border-default/30 bg-card/60 text-xs focus:outline-none focus:border-[var(--pri)]"
            />
            <button 
              type="submit"
              disabled={!inputVal.trim() || sending}
              className="p-2.5 rounded-xl bg-[var(--pri)] hover:bg-[var(--pri)]/80 text-white transition-all disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      )}

      {/* Launcher Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="h-14 w-14 rounded-full bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-white flex items-center justify-center shadow-xl shadow-[var(--pri)]/10 transition-all transform hover:scale-105 active:scale-95 border border-[var(--pri)]/20 animate-pulse-slow"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>
    </div>
  );
}

function intPercent(val: number) {
  return Math.round(val * 100);
}
