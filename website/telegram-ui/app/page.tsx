'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Search, Menu, Paperclip, Smile, Send, Mic, MoreVertical, Phone, CheckCheck, GitBranch, Terminal, MessageCircle } from 'lucide-react';
import Image from 'next/image';

// Mock Data
const CHATS = [
  {
    id: '1',
    name: 'Design Team',
    avatar: 'https://picsum.photos/seed/design/100/100',
    lastMessage: 'Let\'s review the new mockups tomorrow.',
    time: '10:42 AM',
    unread: 3,
    isActive: true,
  },
  {
    id: '2',
    name: 'Engineering Sync',
    avatar: 'https://picsum.photos/seed/eng/100/100',
    lastMessage: 'PR is merged!',
    time: 'Yesterday',
    unread: 0,
  },
  {
    id: '3',
    name: 'Project Alpha',
    avatar: 'https://picsum.photos/seed/alpha/100/100',
    lastMessage: 'Can someone send the link?',
    time: 'Tuesday',
    unread: 0,
  },
];

const INITIAL_MESSAGES = [
  {
    id: '1',
    senderId: 'u1',
    senderName: 'Alice',
    senderColor: 'text-blue-500',
    text: 'Hey everyone, how is the progress on the new feature?',
    time: '10:30 AM',
    isSelf: false,
    avatar: 'https://picsum.photos/seed/alice/100/100',
  },
  {
    id: '2',
    senderId: 'u2',
    senderName: 'Bob',
    senderColor: 'text-green-500',
    text: 'Almost done. Just fixing some edge cases in the UI.',
    time: '10:32 AM',
    isSelf: false,
    avatar: 'https://picsum.photos/seed/bob/100/100',
  },
  {
    id: '3',
    senderId: 'self',
    senderName: 'Me',
    text: 'Great! Let me know if you need any help with the design implementation.',
    time: '10:35 AM',
    isSelf: true,
  },
  {
    id: '4',
    senderId: 'u3',
    senderName: 'Charlie',
    senderColor: 'text-purple-500',
    text: 'I will push the backend changes in an hour.',
    time: '10:40 AM',
    isSelf: false,
    avatar: 'https://picsum.photos/seed/charlie/100/100',
  },
  {
    id: '5',
    senderId: 'u1',
    senderName: 'Alice',
    senderColor: 'text-blue-500',
    text: 'Let\'s review the new mockups tomorrow.',
    time: '10:42 AM',
    isSelf: false,
    avatar: 'https://picsum.photos/seed/alice/100/100',
  },
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return <TelegramClone />;
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] p-4 font-sans selection:bg-blue-100">
      <div className="w-full max-w-[400px] bg-white rounded-[24px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 border border-slate-100/50">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-tr from-blue-500 to-blue-400 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
            <MessageCircle className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight mb-1.5">Welcome back</h1>
          <p className="text-[15px] text-slate-500">Sign in to continue to your chats</p>
        </div>

        <div className="space-y-3">
          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-[#24292e] text-white rounded-xl hover:bg-[#2f363d] transition-all font-medium text-[15px]"
          >
            <GitBranch className="w-5 h-5" />
            Continue with GitHub
          </button>

          <button
            onClick={onLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all font-medium text-[15px] shadow-sm"
          >
            <Terminal className="w-5 h-5" />
            Continue with LinuxDO
          </button>
        </div>

        <div className="flex items-center my-7">
          <div className="flex-1 border-t border-slate-100"></div>
          <span className="px-4 text-[11px] text-slate-400 uppercase tracking-widest font-semibold">or</span>
          <div className="flex-1 border-t border-slate-100"></div>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); onLogin(); }} className="space-y-4">
          <div>
            <input
              type="email"
              placeholder="Email address"
              className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-transparent focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all text-[15px] outline-none text-slate-900 placeholder:text-slate-400"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-3.5 px-4 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-all font-medium text-[15px] shadow-sm hover:shadow"
          >
            Continue with Email
          </button>
        </form>

        <p className="mt-8 text-center text-[13px] text-slate-500 leading-relaxed">
          By continuing, you agree to our <br/>
          <a href="#" className="text-slate-700 hover:text-blue-500 transition-colors underline underline-offset-2 decoration-slate-300 hover:decoration-blue-500">Terms of Service</a> and <a href="#" className="text-slate-700 hover:text-blue-500 transition-colors underline underline-offset-2 decoration-slate-300 hover:decoration-blue-500">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

function TelegramClone() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const newMessage = {
      id: Date.now().toString(),
      senderId: 'self',
      senderName: 'Me',
      text: inputValue,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSelf: true,
    };

    setMessages([...messages, newMessage]);
    setInputValue('');
  };

  return (
    <div className="flex h-screen w-full bg-white text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-white flex-shrink-0">
        {/* Sidebar Header */}
        <div className="h-14 flex items-center px-4 gap-4 border-b border-slate-100">
          <button className="text-slate-500 hover:text-slate-700 transition-colors">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-slate-100 text-slate-900 rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {CHATS.map((chat) => (
            <div
              key={chat.id}
              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                chat.isActive ? 'bg-blue-500 text-white' : 'hover:bg-slate-50'
              }`}
            >
              <Image
                src={chat.avatar}
                alt={chat.name}
                width={48}
                height={48}
                className="w-12 h-12 rounded-full object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h3 className={`font-medium truncate ${chat.isActive ? 'text-white' : 'text-slate-900'}`}>
                    {chat.name}
                  </h3>
                  <span className={`text-xs flex-shrink-0 ${chat.isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    {chat.time}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <p className={`text-sm truncate ${chat.isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    {chat.lastMessage}
                  </p>
                  {chat.unread > 0 && (
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center flex-shrink-0 ${
                      chat.isActive ? 'bg-white text-blue-500' : 'bg-slate-400 text-white'
                    }`}>
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#e4ebf5] relative">
        {/* Chat Background Pattern */}
        <div className="absolute inset-0 opacity-40 pointer-events-none" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239ba9b4' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
        }}></div>

        {/* Chat Header */}
        <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-10 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3 cursor-pointer">
            <Image
              src={CHATS[0].avatar}
              alt={CHATS[0].name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div>
              <h2 className="font-medium text-slate-900 leading-tight">{CHATS[0].name}</h2>
              <p className="text-xs text-slate-500">3 members</p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-500">
            <button className="hover:text-slate-700 transition-colors">
              <Search className="w-5 h-5" />
            </button>
            <button className="hover:text-slate-700 transition-colors">
              <Phone className="w-5 h-5" />
            </button>
            <button className="hover:text-slate-700 transition-colors">
              <MoreVertical className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 z-10 flex flex-col gap-2">
          {/* Date Separator */}
          <div className="flex justify-center my-2">
            <span className="bg-black/10 text-white text-xs font-medium px-2.5 py-1 rounded-full backdrop-blur-sm">
              Today
            </span>
          </div>

          {messages.map((msg, index) => {
            const showAvatar = !msg.isSelf && (index === messages.length - 1 || messages[index + 1].senderId !== msg.senderId);
            const isFirstInGroup = index === 0 || messages[index - 1].senderId !== msg.senderId;

            return (
              <div
                key={msg.id}
                className={`flex max-w-[75%] ${msg.isSelf ? 'self-end' : 'self-start'} ${!msg.isSelf && !showAvatar ? 'ml-11' : ''} ${isFirstInGroup ? 'mt-1' : ''}`}
              >
                {!msg.isSelf && showAvatar && (
                  <Image
                    src={msg.avatar!}
                    alt={msg.senderName}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover mr-2 self-end mb-1"
                  />
                )}
                {!msg.isSelf && !showAvatar && <div className="w-11" />}

                <div
                  className={`relative px-3 py-1.5 rounded-2xl shadow-sm flex flex-col ${
                    msg.isSelf
                      ? 'bg-[#e3f2fd] text-slate-900 rounded-br-sm'
                      : 'bg-white text-slate-900 rounded-bl-sm'
                  }`}
                >
                  {!msg.isSelf && isFirstInGroup && (
                    <span className={`text-sm font-medium mb-0.5 ${msg.senderColor}`}>
                      {msg.senderName}
                    </span>
                  )}
                  <div className="flex items-end gap-2">
                    <span className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                      {msg.text}
                    </span>
                    <div className="flex items-center gap-1 flex-shrink-0 mb-0.5 opacity-60">
                      <span className="text-[11px]">{msg.time}</span>
                      {msg.isSelf && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white p-3 z-10 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-end gap-2">
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mb-1">
              <Paperclip className="w-6 h-6" />
            </button>
            <div className="flex-1 bg-white border border-slate-200 rounded-2xl flex items-end shadow-sm focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
              <button className="p-2.5 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                <Smile className="w-6 h-6" />
              </button>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                placeholder="Write a message..."
                className="flex-1 max-h-32 min-h-[44px] py-2.5 px-2 bg-transparent resize-none focus:outline-none text-[15px] leading-relaxed"
                rows={1}
                style={{ height: 'auto' }}
              />
            </div>
            {inputValue.trim() ? (
              <button
                onClick={handleSendMessage}
                className="p-3 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors flex-shrink-0 shadow-sm mb-0.5"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            ) : (
              <button className="p-3 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 mb-0.5">
                <Mic className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
