import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"
import type { User, Role } from "@/types"
import { api } from "@/lib/api"
import { ApiError } from "@/lib/errors"
import { resetVerifyGate } from "@/lib/authVerifyGate"

/**
 * Raw shape returned by the Express auth middleware (`auth.middleware.ts`)
 * and the login controller (`Auth.controller.ts`). PG column names are
 * snake_case; we normalize at the boundary so the rest of the app only
 * ever sees the camelCase `User` contract.
 */
interface RawUser {
  user_id: number
  username: string
  role: string
  permissions: string[]
  name?: string
}

function normalize(raw: RawUser): User {
  return {
    userId: raw.user_id,
    username: raw.username,
    name: raw.name,
    role: raw.role as Role,
    permissions: raw.permissions,
  }
}

interface LoginResponse {
  user: RawUser
  token?: string
}

interface VerifyResponse {
  valid: boolean
  user: RawUser
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isVerifying: boolean

  login: (payload: LoginResponse) => void
  logout: () => void
  setUser: (user: User) => void

  /**
   * Server-side validation of the persisted `auth` HttpOnly cookie.
   * Called by `PrivateRoute` on mount and after page reload.
   * On success → refreshes `user` from the server's authoritative payload.
   * On 401 → clears local state (the api wrapper handles redirect).
   */
  verify: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isVerifying: false,

      login: ({ user, token }) => {
        set({
          user: normalize(user),
          isAuthenticated: true,
        })
        if (token) {
          // Cookie-only per plan §Decisions: no client-side token storage.
          // Kept here only to acknowledge incoming payloads in dev tools.
          void token
        }
      },

      logout: () => {
        resetVerifyGate()
        set({ user: null, isAuthenticated: false })
      },

      setUser: (user) => {
        set({ user, isAuthenticated: true })
      },

      verify: async () => {
        set({ isVerifying: true })
        try {
          const res = await api.get<VerifyResponse>("/auth/verify")
          if (res.valid && res.user) {
            set({ user: normalize(res.user), isAuthenticated: true })
          } else {
            set({ user: null, isAuthenticated: false })
          }
        } catch (err) {
          if (err instanceof ApiError && err.statusCode === 401) {
            set({ user: null, isAuthenticated: false })
          }
        } finally {
          set({ isVerifying: false })
        }
      },
    }),
    {
      name: "hms-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
