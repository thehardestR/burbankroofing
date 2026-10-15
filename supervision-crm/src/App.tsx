import { HashRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import ProjectDetail from './pages/ProjectDetail'
import Contacts from './pages/Contacts'
import Campaigns from './pages/Campaigns'
import Appointments from './pages/Appointments'
import Automations from './pages/Automations'
import Funnel from './pages/Funnel'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/appointments" element={<Appointments />} />
            <Route path="/automations" element={<Automations />} />
            <Route path="/funnel" element={<Funnel />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
