"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="boot">
      <h1>Something went wrong</h1>
      <p>
        Your saved projects are still in the database. Try opening the workspace
        again.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
