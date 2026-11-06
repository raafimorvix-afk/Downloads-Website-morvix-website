import { signOut } from "@/app/login/actions";

export default function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold">No CRM access yet</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your login works, but it hasn&apos;t been set up in the CRM or it was turned off. Ask an owner to add you.
        </p>
        <form action={signOut} className="mt-4">
          <button className="btn-secondary">Sign out</button>
        </form>
      </div>
    </main>
  );
}
