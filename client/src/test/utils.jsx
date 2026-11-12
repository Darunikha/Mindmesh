import { MemoryRouter } from 'react-router-dom';
import { ThemeContext } from '../context/ThemeContext.jsx';
import { AuthContext } from '../context/AuthContext.jsx';

/** Minimal providers for rendering components in isolation. */
export function Providers({ children, theme = 'studio', user }) {
  const auth = { user: user || { name: 'Ada', preferences: { library: { suggestConnections: true }, ai: {} } }, status: 'authenticated' };
  return (
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <ThemeContext.Provider value={{ theme, setTheme: () => {} }}>{children}</ThemeContext.Provider>
      </AuthContext.Provider>
    </MemoryRouter>
  );
}
