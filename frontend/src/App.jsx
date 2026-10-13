import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="page">
      <h1>Autonomous Supermarket</h1>
      <h2>Server status</h2>
      {error && <p className="error">Error: {error}</p>}
      {!error && !health && <p>Checking...</p>}
      {health && <pre>{JSON.stringify(health, null, 2)}</pre>}
    </div>
  );
}
