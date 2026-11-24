import { useEffect, useState } from "react";
import axios from "axios";
import axiosClient from "../api/axiosClient";
import { getErrorMessage } from "../api/errors";
import { useAuth } from "../context/auth-context";

interface UsersSummary {
  totalUsers: number;
  admins: number;
  newUsersLast7Days: number;
  activeSessions: number;
  generatedAt: string;
}

export default function Reports() {
  const { user } = useAuth();
  const [report, setReport] = useState<UsersSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await axiosClient.get<UsersSummary>("/users/summary");
        setReport(res.data);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 403) {
          setError("Reports are only available to administrators.");
        } else {
          setError(getErrorMessage(err, "Could not load the report."));
        }
      }
    };

    fetchReport();
  }, []);

  if (!user) return null;

  return (
    <div>
      <h2>Reports Summary</h2>
      {error ? (
        <p role="alert">{error}</p>
      ) : !report ? (
        <p>Loading report...</p>
      ) : (
        <div style={{ lineHeight: "1.8" }}>
          <p>
            <b>Total users:</b> {report.totalUsers}
          </p>
          <p>
            <b>Admins:</b> {report.admins}
          </p>
          <p>
            <b>New users (last 7 days):</b> {report.newUsersLast7Days}
          </p>
          <p>
            <b>Active sessions:</b> {report.activeSessions}
          </p>
          <p>
            <b>Generated:</b> {new Date(report.generatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
