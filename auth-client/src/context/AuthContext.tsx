import React, { createContext, useContext, useState, useEffect } from "react";
import axiosClient, { setAccessToken } from "../api/axiosClient";

interface User {
  id: number;
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);
export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const login = async (email: string, password: string) => {
    const res = await axiosClient.post("/auth/login", { email, password });
    setAccessToken(res.data.access_token);
    setUser(res.data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    await axiosClient.post("/users/register", { email, password, name });
  };

  const fetchProfile = async () => {
    try {
      const res = await axiosClient.get("/users/me");
      setUser(res.data);
    } catch (error) {
      console.log(error);
      setUser(null);
    }
  };

  const logout = async () => {
    await axiosClient.post("/auth/logout");
    setAccessToken(null);
    setUser(null);
  };

  // 🪄 NEW: Try refreshing token when app loads
  const tryRefreshToken = async () => {
    try {
      const res = await axiosClient.post("/auth/refresh");
      const newAccessToken = res.data.access_token;
      setAccessToken(newAccessToken);
      await fetchProfile();
    } catch (err) {
      console.log("No valid refresh token, user must log in again.");
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    tryRefreshToken(); // 🔄 Try to restore session on load
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};
