import { useAuth } from "../context/AuthContext";

export default function Profile() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div>
      <h2>Profile</h2>
      <p>
        <b>ID:</b> {user.id}
      </p>
      <p>
        <b>Email:</b> {user.email}
      </p>
      <p>
        <b>Name:</b> {user.name}
      </p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
