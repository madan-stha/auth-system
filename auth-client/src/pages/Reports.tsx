import { useEffect, useState } from "react";
import axiosClient from "../api/axiosClient";
import { useAuth } from "../context/AuthContext";

interface ReportSummary {
  totalUsers: number;
  totalOrders: number;
  revenue: number;
  topProduct: string;
  updatedAt: string;
}

export default function Reports() {
  const { user } = useAuth();
  const [report, setReport] = useState<ReportSummary | null>(null);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        const res = await axiosClient.get("/users/summary");
        setReport(res.data);
      } catch (err) {
        console.error("Error fetching report:", err);
      }
    };

    fetchReport();
  }, []);

  if (!user) return null;

  return (
    <div>
      <h2>Reports Summary</h2>
      {!report ? (
        <p>Loading report...</p>
      ) : (
        <div style={{ lineHeight: "1.8" }}>
          <p>
            <b>Total Users:</b> {report.totalUsers}
          </p>
          <p>
            <b>Total Orders:</b> {report.totalOrders}
          </p>
          <p>
            <b>Revenue:</b> ${report.revenue}
          </p>
          <p>
            <b>Top Product:</b> {report.topProduct}
          </p>
          <p>
            <b>Last Updated:</b> {new Date(report.updatedAt).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}
