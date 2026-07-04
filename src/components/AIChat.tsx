import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Ico } from "./Ico";
import { accent, text1, text2, text3, glass, danger } from "../theme";
import { api } from "../lib/api";
import { useAuth } from "../App";

interface AIChatProps {
  isOpen: boolean;
  onToggle: () => void;
  userRole: string | null;
  clinicId: string | null;
  selectedPatientId: string | null;
}

export const AIChat: React.FC<AIChatProps> = ({ isOpen, onToggle, userRole, clinicId, selectedPatientId }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<{ role: "bot" | "user"; text: string }[]>([]);
  const [input, setInput] = useState(sessionStorage.getItem("ai_chat_draft") || "");
  const [isThinking, setIsThinking] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chats, setChats] = useState<any[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(sessionStorage.getItem("lastAIChatId"));
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);

  // Save draft to sessionStorage (cleared when tab closes, NOT persistent across sessions)
  useEffect(() => {
    sessionStorage.setItem("ai_chat_draft", input);
  }, [input]);

  const fetchChats = async () => {
    if (!user || !clinicId) return;
    try {
      const chatList = await api.aiChats.list(clinicId, user.id);
      setChats(chatList);

      if (!currentChatId && chatList.length > 0) {
        handleSelectChat(chatList[0].id, chatList[0].messages);
      } else if (currentChatId) {
        const current = chatList.find((c: any) => c.id === currentChatId);
        if (current) setMessages(current.messages);
      } else if (chatList.length === 0 && messages.length === 0) {
        setMessages([{ role: "bot", text: "Hello! I'm your Medical AI Assistant. How can I help you today?" }]);
      }
    } catch (error) {
      console.error("Error fetching chats:", error);
    }
  };

  useEffect(() => {
    fetchChats();
  }, [clinicId, currentChatId, user]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  const handleSelectChat = (id: string, msgs: any[]) => {
    setCurrentChatId(id);
    setMessages(msgs);
    sessionStorage.setItem("lastAIChatId", id);
    setShowHistory(false);
  };

  const createNewChat = async () => {
    if (!user || !clinicId) return;

    const initialMsgs = [
      { role: "bot", text: "Hello! I'm your Medical AI Assistant. How can I help you in this new consultation?" },
    ];
    const newChat = await api.aiChats.create({
      userId: user.id,
      clinicId,
      title: "New Consultation",
      messages: initialMsgs,
    });

    handleSelectChat(newChat.id, initialMsgs);
  };

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmed = window.confirm("Are you sure you want to delete this chat?");
    if (!confirmed) return;

    try {
      await api.aiChats.delete(id);
      if (currentChatId === id) {
        setCurrentChatId(null);
        setMessages([]);
        sessionStorage.removeItem("lastAIChatId");
      }
      fetchChats();
    } catch (err) {
      console.error("Error deleting chat:", err);
    }
  };

  const startRename = (chat: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditTitle(chat.title || "New Consultation");
  };

  const saveRename = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      await api.aiChats.update(id, { title: editTitle.trim() });
      setEditingChatId(null);
      fetchChats();
    } catch (err) {
      console.error("Error renaming chat:", err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking || !user || !clinicId) return;

    const userMsg = input.trim();
    const newMessages = [...messages, { role: "user" as const, text: userMsg }];
    setMessages(newMessages);
    setInput("");
    sessionStorage.removeItem("ai_chat_draft");
    setIsThinking(true);

    try {
      // Call the server-side AI endpoint. The server sanitizes PHI before
      // forwarding to Gemini, and the GEMINI_API_KEY never reaches the browser.
      const data = await api.ai.chat({
        message: userMsg,
        history: newMessages.slice(0, -1),
        selectedPatientId: selectedPatientId || undefined,
      });
      const botText = data.reply;
      const finalMessages = [...newMessages, { role: "bot" as const, text: botText }];
      setMessages(finalMessages);

      if (currentChatId) {
        await api.aiChats.update(currentChatId, {
          messages: finalMessages,
          ...(messages.length <= 1 ? { title: userMsg.substring(0, 30) + (userMsg.length > 30 ? "..." : "") } : {}),
        });
      } else {
        const newChat = await api.aiChats.create({
          userId: user.id,
          clinicId,
          title: userMsg.substring(0, 30),
          messages: finalMessages,
        });
        setCurrentChatId(newChat.id);
        sessionStorage.setItem("lastAIChatId", newChat.id);
      }
      fetchChats();
    } catch (error: any) {
      console.error("IA Error:", error);
      setMessages((prev) => [...prev, { role: "bot", text: `Error: ${error.message}` }]);
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{
        duration: 0.5,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        width: "100%",
        height: "100%",
        background: glass.card,
        backdropFilter: glass.blur,
        WebkitBackdropFilter: glass.blur,
        borderRadius: 16,
        border: `1px solid ${glass.border}`,
        boxShadow: glass.shadow,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px 24px 16px",
          borderBottom: `1px solid ${glass.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <p style={{ fontSize: 16, fontWeight: 700, color: text1 }}>AI CONSULTATION</p>
            <button
              onClick={() => setShowHistory(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 4,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              <Ico name="History" size={12} color={accent} />
              <p style={{ fontSize: 11, color: accent, fontWeight: 600 }}>Chat history</p>
            </button>
          </div>
        </div>
        <button
          onClick={onToggle}
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(255,255,255,0.05)",
            border: `1px solid ${glass.border}`,
            cursor: "pointer",
            color: text2,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.1)";
            e.currentTarget.style.transform = "scale(1.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            e.currentTarget.style.transform = "scale(1)";
          }}
        >
          <Ico name="X" size={16} />
        </button>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          padding: "24px",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          scrollBehavior: "smooth",
        }}
      >
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%" }}
          >
            <div
              style={{
                padding: "12px 18px",
                borderRadius: 14,
                background: m.role === "user" ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${m.role === "user" ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"}`,
                color: text1,
                fontSize: 13,
                lineHeight: 1.5,
                fontWeight: 500,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
              }}
            >
              {m.text}
            </div>
          </motion.div>
        ))}
        {isThinking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              alignSelf: "flex-start",
              display: "flex",
              gap: 6,
              padding: "10px 16px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.02)",
              border: `1px solid ${glass.border}`,
            }}
          >
            {[0, 1, 2].map((dot) => (
              <motion.div
                key={dot}
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1, delay: dot * 0.2 }}
                style={{ width: 4, height: 4, borderRadius: "50%", background: text3 }}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Input Area */}
      <div style={{ padding: "20px 24px", borderTop: `1px solid ${glass.border}` }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", maxWidth: 900, margin: "0 auto" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Write your medical or administrative query..."
            style={{
              flex: 1,
              padding: "12px 16px",
              borderRadius: 12,
              background: glass.input,
              border: `1px solid ${glass.border}`,
              color: text1,
              fontSize: 13,
              outline: "none",
              transition: "all 0.2s",
              fontFamily: "inherit",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)";
              e.currentTarget.style.background = "rgba(255,255,255,0.05)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = glass.border;
              e.currentTarget.style.background = glass.input;
            }}
          />
          <button
            onClick={handleSend}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,255,255,0.95)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            <Ico name="Send" size={16} color="#000" stroke={2.5} />
          </button>
          {/* Spacer to avoid the bot face */}
          <div style={{ width: 80, flexShrink: 0 }} />
        </div>
      </div>

      {/* History Overlay */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 320,
              height: "100%",
              background: "rgba(10, 10, 10, 0.95)",
              backdropFilter: "blur(20px)",
              borderRight: `1px solid ${glass.border}`,
              zIndex: 100,
              display: "flex",
              flexDirection: "column",
              padding: 24,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: text1 }}>History</p>
              <button
                onClick={() => setShowHistory(false)}
                style={{ background: "none", border: "none", color: text3, cursor: "pointer" }}
              >
                <Ico name="X" size={20} />
              </button>
            </div>

            <button
              onClick={createNewChat}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 12,
                background: accent,
                color: "#000",
                border: "none",
                fontWeight: 700,
                marginBottom: 20,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <Ico name="Plus" size={16} color="#000" />
              New Consultation
            </button>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id, chat.messages)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    background: currentChatId === chat.id ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${currentChatId === chat.id ? accent : "transparent"}`,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    transition: "all 0.2s",
                  }}
                >
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    {editingChatId === chat.id ? (
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => saveRename(chat.id)}
                        onKeyDown={(e) => e.key === "Enter" && saveRename(chat.id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: "100%",
                          background: "rgba(255,255,255,0.1)",
                          border: `1px solid ${accent}`,
                          color: text1,
                          fontSize: 13,
                          padding: "4px 8px",
                          borderRadius: 4,
                          outline: "none",
                        }}
                      />
                    ) : (
                      <>
                        <p
                          style={{
                            fontSize: 13,
                            color: text1,
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {chat.title || "Untitled"}
                        </p>
                        <p style={{ fontSize: 10, color: text3 }}>{chat.updatedAt?.toDate?.().toLocaleDateString()}</p>
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={(e) => startRename(chat, e)}
                      style={{ background: "none", border: "none", color: text3, cursor: "pointer", padding: 4 }}
                    >
                      <Ico name="Pencil" size={14} />
                    </button>
                    <button
                      onClick={(e) => deleteChat(chat.id, e)}
                      style={{ background: "none", border: "none", color: danger, cursor: "pointer", padding: 4 }}
                    >
                      <Ico name="Trash2" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export const AIChatButton: React.FC<{ onToggle: () => void }> = ({ onToggle }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -5 }}
      whileTap={{ scale: 0.95 }}
      animate={{
        y: [0, -10, 0],
      }}
      transition={{
        y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
      }}
      onClick={onToggle}
      style={{
        position: "fixed",
        bottom: 32,
        right: 32,
        width: 72,
        height: 72,
        borderRadius: "50%",
        background: "linear-gradient(145deg, #ffffff, #f0f2f5)",
        boxShadow:
          "0 15px 35px rgba(0,0,0,0.4), inset 0 -4px 8px rgba(0,0,0,0.05), inset 0 4px 8px rgba(255,255,255,1)",
        cursor: "pointer",
        zIndex: 2001,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "1px solid rgba(255,255,255,0.8)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: -2 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <motion.div
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 4 }}
              style={{
                width: 11,
                height: 15,
                borderRadius: "50%",
                background: "#1a202c",
                position: "relative",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  right: 2,
                  width: 3.5,
                  height: 3.5,
                  borderRadius: "50%",
                  background: "#fff",
                  opacity: 0.9,
                }}
              />
            </motion.div>
            <motion.div
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 4 }}
              style={{
                width: 11,
                height: 15,
                borderRadius: "50%",
                background: "#1a202c",
                position: "relative",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 3,
                  right: 2,
                  width: 3.5,
                  height: 3.5,
                  borderRadius: "50%",
                  background: "#fff",
                  opacity: 0.9,
                }}
              />
            </motion.div>
          </div>
          <svg width="22" height="10" viewBox="0 0 22 10" fill="none" style={{ marginTop: 2 }}>
            <path
              d="M4 2C6 5.5 10 7 11 7C12 7 16 5.5 18 2"
              stroke="#1a202c"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.85"
            />
          </svg>
        </div>
      </div>
    </motion.div>
  );
};
