/** Re-mounts on every navigation inside the back office → soft page entrance. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
