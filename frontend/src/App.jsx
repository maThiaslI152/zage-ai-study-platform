import React, { createContext, useContext, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
} from 'aws-amplify/auth'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import SubjectView from './pages/SubjectView'
import DocumentView from './pages/DocumentView'

// ─── Auth Context ───────────────────────────────────────────────────────────
export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for existing session on mount
  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser()
      const session = await fetchAuthSession()
      const email =
        session.tokens?.idToken?.payload?.email ||
        currentUser.signInDetails?.loginId ||
        ''
      setUser({
        userId: currentUser.userId,
        email,
        name: email.split('@')[0],
      })
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    const result = await signIn({ username: email, password })
    if (result.isSignedIn) {
      await checkAuth()
    }
    return result
  }

  async function signup(email, password) {
    const result = await signUp({
      username: email,
      password,
      options: { userAttributes: { email } },
    })
    return result
  }

  async function confirmOtp(email, code) {
    await confirmSignUp({ username: email, confirmationCode: code })
  }

  async function logout() {
    await signOut()
    setUser(null)
  }

  async function getToken() {
    try {
      const session = await fetchAuthSession()
      return session.tokens?.idToken?.toString() || ''
    } catch {
      return ''
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin w-8 h-8 border-2 border-[#378ADD] border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoggedIn: !!user,
        login,
        signup,
        confirmOtp,
        logout,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// ─── Route Guards ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth()
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return children
}

function PublicRoute({ children }) {
  const { isLoggedIn } = useAuth()
  if (isLoggedIn) return <Navigate to="/dashboard" replace />
  return children
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route
            path="/login"
            element={<PublicRoute><Login /></PublicRoute>}
          />
          <Route
            path="/signup"
            element={<PublicRoute><Signup /></PublicRoute>}
          />
          <Route
            path="/dashboard"
            element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
          />
          <Route
            path="/subjects/:subjectId"
            element={<ProtectedRoute><SubjectView /></ProtectedRoute>}
          />
          <Route
            path="/documents/:id"
            element={<ProtectedRoute><DocumentView /></ProtectedRoute>}
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
