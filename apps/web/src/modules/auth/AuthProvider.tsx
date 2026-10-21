import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  AuthError,
  authMessage,
  authRequest,
  sessionSchema,
  type AuthSession,
} from './api/auth-api';

type AuthState = {
  status: 'loading' | 'anonymous' | 'authenticated' | 'error';
  session: AuthSession | null;
  error: string;
};
interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  mutation: (path: string, method?: 'POST' | 'DELETE') => Promise<void>;
  clear: () => void;
}
const Context = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, error: '' });
  const generation = useRef(0);
  const clear = useCallback(() => {
    generation.current++;
    setState({ status: 'anonymous', session: null, error: '' });
  }, []);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const session = sessionSchema.parse(await authRequest('/session'));
      if (current === generation.current) setState({ status: 'authenticated', session, error: '' });
    } catch (error) {
      if (current !== generation.current) return;
      setState(
        error instanceof AuthError && error.status === 401
          ? { status: 'anonymous', session: null, error: '' }
          : { status: 'error', session: null, error: authMessage(error) },
      );
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const current = ++generation.current;
    authRequest('/session')
      .then((data) => {
        if (!cancelled && current === generation.current)
          setState({ status: 'authenticated', session: sessionSchema.parse(data), error: '' });
      })
      .catch((error: unknown) => {
        if (cancelled || current !== generation.current) return;
        setState(
          error instanceof AuthError && error.status === 401
            ? { status: 'anonymous', session: null, error: '' }
            : { status: 'error', session: null, error: authMessage(error) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    const onFocus = () => {
      if (state.status === 'authenticated') void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh, state.status]);
  async function signIn(email: string, password: string) {
    const current = ++generation.current;
    const session = sessionSchema.parse(
      await authRequest('/login', { method: 'POST', body: { email, password } }),
    );
    if (current === generation.current) setState({ status: 'authenticated', session, error: '' });
  }
  async function mutation(path: string, method: 'POST' | 'DELETE' = 'POST') {
    if (!state.session) throw new AuthError(401, 'UNAUTHENTICATED', 'Please sign in again.');
    try {
      await authRequest(path, { method, csrfToken: state.session.csrfToken });
    } catch (error) {
      if (error instanceof AuthError && error.status === 401) clear();
      throw error;
    }
  }
  return (
    <Context.Provider value={{ ...state, refresh, signIn, mutation, clear }}>
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const context = useContext(Context);
  if (!context) throw new Error('AuthProvider is required');
  return context;
}
