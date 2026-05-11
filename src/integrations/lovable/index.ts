// Stub: Lovable auth replaced with Supabase auth directly
export const lovable = {
  auth: {
    signInWithOAuth: async () => {
      return { error: new Error("OAuth not configured in this environment") };
    },
  },
};
