// app/not-found.jsx
import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        color: "#ffffff",
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <Image
        src="/brand/notfound.png"
        alt="Robot holding disconnected cables"
        width={320}
        height={320}
        priority
        style={{ marginBottom: "1.5rem" }}
      />
      <h1 style={{ fontSize: "3rem", margin: 0, fontWeight: 700 }}>404</h1>
      <p style={{ fontSize: "1.1rem", color: "#aaaaaa", marginTop: "0.5rem" }}>
        Oops! This connection couldn&apos;t be made. The page you&apos;re
        looking for doesn&apos;t exist.
      </p>
      <Link
        href="/"
        style={{
          marginTop: "1.5rem",
          padding: "0.75rem 1.5rem",
          backgroundColor: "#ffffff",
          color: "#0a0a0a",
          borderRadius: "8px",
          textDecoration: "none",
          fontWeight: 600,
        }}
      >
        Go back home
      </Link>
    </div>
  );
}