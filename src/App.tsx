// src/App.tsx
import React, { useEffect, useState } from "react";
import LinkManager from "./LinkManager";

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "登录失败");
      } else {
        onLoggedIn();
      }
    } catch (err) {
      setError("网络异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-lg rounded-2xl p-8 w-full max-w-sm space-y-4"
      >
        <h1 className="text-xl font-bold text-center mb-2">Link Manager 登录</h1>
        <p className="text-xs text-gray-400 text-center mb-4">
          请输入访问密码（默认密码详见 README）
        </p>
        <input
          type="password"
          placeholder="密码"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <div className="text-sm text-red-500 bg-red-50 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-indigo-600 text-white rounded-lg py-2 font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<"unknown" | "authed" | "guest">(
    "unknown"
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth-status");
        const data = await res.json();
        setAuthState(data.authenticated ? "authed" : "guest");
      } catch {
        // 如果请求失败，可以默认认为未登录
        setAuthState("guest");
      }
    })();
  }, []);

  if (authState === "unknown") {
    return (
      <div className="h-screen flex items-center justify-center text-gray-400">
        加载中...
      </div>
    );
  }

  if (authState === "guest") {
    return <LoginScreen onLoggedIn={() => setAuthState("authed")} />;
  }

  // 已登录，正常展示你的 Link 管理界面
  return <LinkManager />;
}
