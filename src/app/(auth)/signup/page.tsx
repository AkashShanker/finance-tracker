"use client";

import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setError("Signup succeeded but no user returned");
      setLoading(false);
      return;
    }

    const { data: result, error: setupError } = await supabase.rpc("handle_signup", {
      p_user_id: userId,
      p_email: email,
      p_display_name: displayName || null,
      p_invite_code: inviteCode.trim() || null,
    });

    if (setupError) {
      setError("Failed to set up account: " + setupError.message);
      setLoading(false);
      return;
    }

    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Auto-link: if a household_member exists with matching email, set profile_id
    if (result?.household_id && email) {
      const { data: matchingMember } = await supabase
        .from("household_members")
        .select("id")
        .eq("household_id", result.household_id)
        .eq("email", email.toLowerCase().trim())
        .is("profile_id", null)
        .single();

      if (matchingMember) {
        await supabase
          .from("household_members")
          .update({ profile_id: userId })
          .eq("id", matchingMember.id);
      }
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">FinTracker</h1>
          <p className="text-sm text-gray-400 mt-1">Create your account</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-gray-200/40 p-6 space-y-4"
        >
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl">
              {error}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-shadow"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              Household Invite Code{" "}
              <span className="text-gray-300 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Enter code to join a household"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-shadow"
            />
            <p className="text-xs text-gray-400 mt-1.5">
              Have an invite code from your partner? Enter it to share finances.
              Leave blank to create a new household.
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm transition-colors shadow-sm"
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
          <p className="text-center text-xs text-gray-400">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
