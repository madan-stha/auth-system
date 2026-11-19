import React, { useState, useEffect } from "react";
import axiosClient, { setAccessToken } from "../api/axiosClient";
import { AuthContext, type User } from "./auth-context";

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

  // Try to restore the session from the refresh cookie when the app loads
  useEffect(() => {
    const tryRefreshToken = async () => {
      try {
        const res = await axiosClient.post("/auth/refresh");
        setAccessToken(res.data.access_token);
        const me = await axiosClient.get("/users/me");
        setUser(me.data);
      } catch {
        console.log("No valid refresh token, user must log in again.");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    tryRefreshToken();
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, fetchProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
};
