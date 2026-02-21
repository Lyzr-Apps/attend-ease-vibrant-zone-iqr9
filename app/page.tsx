'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import {
  listSchedules,
  getScheduleLogs,
  pauseSchedule,
  resumeSchedule,
  cronToHuman,
} from '@/lib/scheduler'
import type { Schedule, ExecutionLog } from '@/lib/scheduler'

import {
  FiHome,
  FiCheckCircle,
  FiFileText,
  FiUser,
  FiBell,
  FiPlus,
  FiSearch,
  FiClock,
  FiTrendingUp,
  FiTrendingDown,
  FiAlertTriangle,
  FiAlertCircle,
  FiCalendar,
  FiCopy,
  FiRefreshCw,
  FiPause,
  FiPlay,
  FiBarChart2,
  FiUsers,
  FiBook,
  FiSend,
  FiLoader,
  FiActivity,
  FiX,
  FiMenu,
  FiArrowRight,
} from 'react-icons/fi'

// ============================================================================
// Constants
// ============================================================================

const AGENT_IDS = {
  ATTENDANCE_REPORT: '69994f68938bc0103dbe0b9d',
  STUDENT_PROFILE: '69994f68db37e68c87a52c81',
  ATTENDANCE_ALERT: '69994f6802de7ae3dd4c1b77',
} as const

const SCHEDULE_ID = '69994f72399dfadeac37e0e8'

const SUBJECTS = ['MEFA', 'DBMS', 'OS', 'JAVA', 'PYTHON'] as const

const THEME_VARS = {
  '--background': '160 35% 96%',
  '--foreground': '160 35% 8%',
  '--card': '160 30% 99%',
  '--card-foreground': '160 35% 8%',
  '--primary': '160 85% 35%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '160 30% 93%',
  '--secondary-foreground': '160 35% 12%',
  '--accent': '45 95% 50%',
  '--muted': '160 25% 90%',
  '--muted-foreground': '160 25% 40%',
  '--border': '160 28% 88%',
  '--destructive': '0 84% 60%',
  '--ring': '160 85% 35%',
} as React.CSSProperties

type NavTab = 'dashboard' | 'attendance' | 'reports' | 'profiles' | 'alerts' | 'sessions'

// ============================================================================
// Interfaces
// ============================================================================

interface AttendanceReport {
  subject?: string
  total_students?: number
  present_count?: number
  absent_count?: number
  attendance_percentage?: number
  trend_summary?: string
  absentee_list?: string[]
  report_summary?: string
}

interface SubjectAttendance {
  subject?: string
  classes_attended?: number
  total_classes?: number
  percentage?: number
}

interface StudentProfile {
  student_name?: string
  roll_number?: string
  overall_attendance_percentage?: number
  subject_wise_attendance?: SubjectAttendance[]
  status?: string
  remarks?: string
}

interface AlertItem {
  student_name?: string
  roll_number?: string
  subject?: string
  attendance_percentage?: number
  classes_missed?: number
  severity?: string
}

interface AlertResponse {
  alert_date?: string
  threshold_percentage?: number
  alerts?: AlertItem[]
  total_alerts?: number
  summary?: string
}

interface AttendanceSession {
  id: string
  subject: string
  code: string
  date: string
  time: string
  duration: number
  attendees: string[]
}

interface AttendanceRecord {
  name: string
  rollNumber: string
  code: string
  subject: string
  timestamp: string
}

interface ProfileQuery {
  query: string
  result: StudentProfile | null
  error?: string
  timestamp: string
}

// ============================================================================
// Helpers
// ============================================================================

function parseAgentResponse<T>(result: Record<string, unknown> | undefined | null): T | null {
  if (!result) return null
  try {
    const response = result.response as Record<string, unknown> | string | undefined
    if (!response) return null

    let respObj: Record<string, unknown>
    if (typeof response === 'string') {
      try {
        respObj = JSON.parse(response)
      } catch (_e) {
        return null
      }
    } else {
      respObj = response
    }

    let data = respObj?.result
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch (_e) {
        // leave as string
      }
    }

    if (data && typeof data === 'object') {
      return data as T
    }

    // fallback: maybe the response itself is the data
    if (respObj && typeof respObj === 'object' && !Array.isArray(respObj)) {
      return respObj as unknown as T
    }

    return null
  } catch (_e) {
    return null
  }
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function getSeverityClasses(severity?: string): string {
  const s = (severity ?? '').toLowerCase()
  if (s === 'severe') return 'bg-red-100 text-red-800 border-red-200'
  if (s === 'critical') return 'bg-orange-100 text-orange-800 border-orange-200'
  if (s === 'warning') return 'bg-yellow-100 text-yellow-800 border-yellow-200'
  return 'bg-gray-100 text-gray-800 border-gray-200'
}

function getSeverityBadge(severity?: string): string {
  const s = (severity ?? '').toLowerCase()
  if (s === 'severe') return 'bg-red-500 text-white'
  if (s === 'critical') return 'bg-orange-500 text-white'
  if (s === 'warning') return 'bg-amber-400 text-amber-900'
  return 'bg-gray-400 text-white'
}

function getStatusColor(status?: string): string {
  const s = (status ?? '').toLowerCase()
  if (s.includes('good')) return 'bg-emerald-100 text-emerald-800 border-emerald-300'
  if (s.includes('risk')) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  if (s.includes('critical')) return 'bg-red-100 text-red-800 border-red-300'
  return 'bg-gray-100 text-gray-800 border-gray-300'
}

function getSubjectColor(index: number): string {
  const colors = [
    'bg-emerald-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-blue-500',
    'bg-rose-500',
  ]
  return colors[index % colors.length] ?? 'bg-gray-500'
}

function getSubjectLightColor(index: number): string {
  const colors = [
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-amber-50 text-amber-700 border-amber-200',
    'bg-purple-50 text-purple-700 border-purple-200',
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-rose-50 text-rose-700 border-rose-200',
  ]
  return colors[index % colors.length] ?? 'bg-gray-50 text-gray-700'
}

// ============================================================================
// Sample Data
// ============================================================================

const SAMPLE_REPORT: AttendanceReport = {
  subject: 'DBMS',
  total_students: 60,
  present_count: 52,
  absent_count: 8,
  attendance_percentage: 86.7,
  trend_summary: 'Attendance has been improving over the last 3 weeks. Average went from 78% to 86.7%, indicating better student engagement after mid-semester feedback.',
  absentee_list: ['Rahul Sharma (101)', 'Priya Patel (108)', 'Amit Kumar (115)', 'Sneha Reddy (122)', 'Vikram Singh (130)', 'Ananya Gupta (135)', 'Rohan Joshi (142)', 'Meera Nair (149)'],
  report_summary: 'The DBMS class has shown a positive attendance trend. Out of 60 enrolled students, 52 were present today (86.7%). The absentee count decreased from last week. Recommend follow-up with chronic absentees.',
}

const SAMPLE_PROFILE: StudentProfile = {
  student_name: 'Rahul Sharma',
  roll_number: '101',
  overall_attendance_percentage: 72.5,
  subject_wise_attendance: [
    { subject: 'MEFA', classes_attended: 18, total_classes: 22, percentage: 81.8 },
    { subject: 'DBMS', classes_attended: 15, total_classes: 24, percentage: 62.5 },
    { subject: 'OS', classes_attended: 19, total_classes: 23, percentage: 82.6 },
    { subject: 'JAVA', classes_attended: 14, total_classes: 22, percentage: 63.6 },
    { subject: 'PYTHON', classes_attended: 17, total_classes: 21, percentage: 81.0 },
  ],
  status: 'At Risk',
  remarks: 'Attendance is below the 75% threshold in DBMS and JAVA. Immediate improvement needed to avoid debarment from examinations.',
}

const SAMPLE_ALERTS: AlertResponse = {
  alert_date: '2025-02-21',
  threshold_percentage: 75,
  alerts: [
    { student_name: 'Rahul Sharma', roll_number: '101', subject: 'DBMS', attendance_percentage: 62.5, classes_missed: 9, severity: 'Severe' },
    { student_name: 'Rahul Sharma', roll_number: '101', subject: 'JAVA', attendance_percentage: 63.6, classes_missed: 8, severity: 'Critical' },
    { student_name: 'Priya Patel', roll_number: '108', subject: 'OS', attendance_percentage: 70.0, classes_missed: 7, severity: 'Warning' },
    { student_name: 'Amit Kumar', roll_number: '115', subject: 'MEFA', attendance_percentage: 68.2, classes_missed: 7, severity: 'Critical' },
    { student_name: 'Sneha Reddy', roll_number: '122', subject: 'PYTHON', attendance_percentage: 71.4, classes_missed: 6, severity: 'Warning' },
  ],
  total_alerts: 5,
  summary: '5 attendance alerts generated. 1 severe case (Rahul Sharma in DBMS at 62.5%), 2 critical cases, and 2 warnings. Recommend faculty counseling for students with severe/critical alerts.',
}

const SAMPLE_SESSIONS: AttendanceSession[] = [
  { id: '1', subject: 'DBMS', code: 'DB3X7K', date: '2025-02-21', time: '09:00', duration: 60, attendees: ['101', '102', '103'] },
  { id: '2', subject: 'OS', code: 'OS9P2M', date: '2025-02-21', time: '11:00', duration: 60, attendees: ['101', '104'] },
  { id: '3', subject: 'JAVA', code: 'JV5T8N', date: '2025-02-21', time: '14:00', duration: 90, attendees: [] },
]

const SAMPLE_RECORDS: AttendanceRecord[] = [
  { name: 'Rahul Sharma', rollNumber: '101', code: 'DB3X7K', subject: 'DBMS', timestamp: '2025-02-21T09:02:00' },
  { name: 'Priya Patel', rollNumber: '108', code: 'DB3X7K', subject: 'DBMS', timestamp: '2025-02-21T09:03:00' },
  { name: 'Amit Kumar', rollNumber: '115', code: 'OS9P2M', subject: 'OS', timestamp: '2025-02-21T11:05:00' },
]

// ============================================================================
// ErrorBoundary
// ============================================================================

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm hover:bg-emerald-700 transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ============================================================================
// Inline Components
// ============================================================================

function GlassCard({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white/75 backdrop-blur-md border border-white/20 shadow-lg rounded-xl ${className}`}>
      {children}
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  subtext?: string
  color: string
}) {
  return (
    <GlassCard className="p-5">
      <div className="flex items-start gap-4">
        <div className={`p-3 rounded-xl ${color}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{value}</p>
          {subtext && <p className="text-xs text-gray-500 mt-1">{subtext}</p>}
        </div>
      </div>
    </GlassCard>
  )
}

function LoadingSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="animate-pulse flex gap-3">
          <div className="h-4 bg-emerald-100 rounded-lg flex-1" style={{ width: `${70 + Math.random() * 30}%` }} />
        </div>
      ))}
    </div>
  )
}

function InlineMessage({
  type,
  message,
  onDismiss,
}: {
  type: 'success' | 'error' | 'info'
  message: string
  onDismiss?: () => void
}) {
  const colors = {
    success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
  }
  const icons = {
    success: <FiCheckCircle className="w-4 h-4" />,
    error: <FiAlertCircle className="w-4 h-4" />,
    info: <FiActivity className="w-4 h-4" />,
  }
  return (
    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${colors[type]}`}>
      {icons[type]}
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="hover:opacity-70">
          <FiX className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}

function ProgressBar({ value, max = 100, color = 'bg-emerald-500' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ============================================================================
// Dashboard Tab
// ============================================================================

function DashboardTab({ useSample }: { useSample: boolean }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const subjectStats = useSample
    ? [
        { name: 'MEFA', pct: 84.2, trend: 'up' },
        { name: 'DBMS', pct: 86.7, trend: 'up' },
        { name: 'OS', pct: 78.3, trend: 'down' },
        { name: 'JAVA', pct: 71.5, trend: 'down' },
        { name: 'PYTHON', pct: 89.1, trend: 'up' },
      ]
    : []

  const recentActivity = useSample
    ? [
        { text: 'DBMS session completed - 52/60 present', time: '2 hours ago', icon: <FiCheckCircle className="w-4 h-4 text-emerald-500" /> },
        { text: 'Alert: Rahul Sharma below 75% in JAVA', time: '3 hours ago', icon: <FiAlertTriangle className="w-4 h-4 text-amber-500" /> },
        { text: 'OS session started - Code: OS9P2M', time: '5 hours ago', icon: <FiActivity className="w-4 h-4 text-blue-500" /> },
        { text: 'Attendance alert check completed', time: '6 hours ago', icon: <FiBell className="w-4 h-4 text-purple-500" /> },
        { text: 'PYTHON session completed - 55/60 present', time: '1 day ago', icon: <FiCheckCircle className="w-4 h-4 text-emerald-500" /> },
      ]
    : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Welcome to AttendEase</h1>
        <p className="text-gray-500 mt-1">Smart Student Attendance Tracker - Quick Overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<FiUsers className="w-5 h-5 text-emerald-600" />}
          label="Total Students"
          value={useSample ? 60 : '--'}
          subtext={useSample ? 'Across 5 subjects' : 'No data yet'}
          color="bg-emerald-50"
        />
        <StatCard
          icon={<FiCalendar className="w-5 h-5 text-blue-600" />}
          label="Today's Sessions"
          value={useSample ? 3 : 0}
          subtext={useSample ? '2 completed, 1 upcoming' : 'No sessions today'}
          color="bg-blue-50"
        />
        <StatCard
          icon={<FiBarChart2 className="w-5 h-5 text-purple-600" />}
          label="Avg. Attendance"
          value={useSample ? '82.0%' : '--'}
          subtext={useSample ? 'This semester' : 'Generate a report'}
          color="bg-purple-50"
        />
        <StatCard
          icon={<FiAlertTriangle className="w-5 h-5 text-amber-600" />}
          label="Active Alerts"
          value={useSample ? 5 : 0}
          subtext={useSample ? '1 severe, 2 critical' : 'No alerts'}
          color="bg-amber-50"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiBook className="w-5 h-5 text-emerald-600" />
            Subject-wise Attendance
          </h2>
          {subjectStats.length > 0 ? (
            <div className="space-y-4">
              {subjectStats.map((s, i) => (
                <div key={s.name} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">{s.name}</span>
                    <div className="flex items-center gap-2">
                      {s.trend === 'up' ? (
                        <FiTrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <FiTrendingDown className="w-3.5 h-3.5 text-red-500" />
                      )}
                      <span className="text-sm font-semibold text-gray-900">{s.pct}%</span>
                    </div>
                  </div>
                  <ProgressBar value={s.pct} color={getSubjectColor(i)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <FiBarChart2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Enable Sample Data to see attendance overview</p>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiActivity className="w-5 h-5 text-emerald-600" />
            Recent Activity
          </h2>
          {recentActivity.length > 0 ? (
            <div className="space-y-3">
              {recentActivity.map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-emerald-50/50 transition-colors">
                  <div className="mt-0.5">{a.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">{a.text}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <FiClock className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No recent activity. Create a session to get started.</p>
            </div>
          )}
        </GlassCard>
      </div>

      {!useSample && mounted && (
        <GlassCard className="p-6 text-center">
          <FiArrowRight className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
          <h3 className="font-semibold text-gray-800">Get Started</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Create an attendance session, generate reports with AI, or toggle Sample Data in the top-right corner to explore the dashboard.
          </p>
        </GlassCard>
      )}
    </div>
  )
}

// ============================================================================
// Mark Attendance Tab
// ============================================================================

function MarkAttendanceTab({ useSample }: { useSample: boolean }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [records, setRecords] = useState<AttendanceRecord[]>([])

  useEffect(() => {
    if (useSample) {
      setRecords(SAMPLE_RECORDS)
    } else {
      setRecords([])
    }
  }, [useSample])

  const handleSubmit = useCallback(() => {
    if (!code.trim() || !name.trim() || !rollNumber.trim()) {
      setFeedback({ type: 'error', message: 'Please fill in all fields.' })
      return
    }
    if (code.trim().length !== 6) {
      setFeedback({ type: 'error', message: 'Attendance code must be 6 characters.' })
      return
    }
    setSubmitting(true)
    setFeedback(null)
    // Simulate a brief delay for local CRUD
    setTimeout(() => {
      const subjects = ['MEFA', 'DBMS', 'OS', 'JAVA', 'PYTHON']
      const detectedSubject = subjects[Math.floor(Math.random() * subjects.length)] ?? 'DBMS'
      const newRecord: AttendanceRecord = {
        name: name.trim(),
        rollNumber: rollNumber.trim(),
        code: code.trim().toUpperCase(),
        subject: detectedSubject,
        timestamp: new Date().toISOString(),
      }
      setRecords(prev => [newRecord, ...prev])
      setFeedback({ type: 'success', message: `Attendance marked for ${name.trim()} in ${detectedSubject}!` })
      setCode('')
      setName('')
      setRollNumber('')
      setSubmitting(false)
    }, 800)
  }, [code, name, rollNumber])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Mark Attendance</h2>
        <p className="text-gray-500 mt-1">Enter your session code to check in</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Attendance Code</label>
              <input
                type="text"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. DB3X7K"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white/80 text-center text-2xl font-mono tracking-[0.3em] focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all"
              />
              <p className="text-xs text-gray-400 mt-1.5">6-character alphanumeric code from your teacher</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Student Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Rahul Sharma"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Roll Number</label>
              <input
                type="text"
                value={rollNumber}
                onChange={e => setRollNumber(e.target.value)}
                placeholder="e.g. 101"
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
              />
            </div>

            {feedback && (
              <InlineMessage type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-200"
            >
              {submitting ? (
                <>
                  <FiLoader className="w-4 h-4 animate-spin" />
                  Marking...
                </>
              ) : (
                <>
                  <FiCheckCircle className="w-4 h-4" />
                  Mark Attendance
                </>
              )}
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FiClock className="w-4 h-4 text-emerald-600" />
            Recent Check-ins
          </h3>
          {records.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {records.map((r, i) => (
                <div key={i} className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{r.name}</p>
                      <p className="text-xs text-gray-500">Roll No: {r.rollNumber}</p>
                    </div>
                    <span className="text-xs font-mono bg-white px-2 py-1 rounded-md border border-gray-200">{r.code}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs font-medium text-emerald-600">{r.subject}</span>
                    <span className="text-xs text-gray-400">{new Date(r.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <FiCheckCircle className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No check-ins yet</p>
              <p className="text-xs mt-1">Enter a session code to mark attendance</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

// ============================================================================
// Reports Tab
// ============================================================================

function ReportsTab({ useSample, setActiveAgent }: { useSample: boolean; setActiveAgent: (id: string | null) => void }) {
  const [selectedSubject, setSelectedSubject] = useState('All Subjects')
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<AttendanceReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (useSample) {
      setReport(SAMPLE_REPORT)
    } else {
      setReport(null)
    }
  }, [useSample])

  const handleGenerate = useCallback(async () => {
    setLoading(true)
    setError(null)
    setReport(null)
    setActiveAgent(AGENT_IDS.ATTENDANCE_REPORT)

    try {
      const message = selectedSubject === 'All Subjects'
        ? 'Generate attendance report for all subjects'
        : `Generate attendance report for ${selectedSubject}`
      const result = await callAIAgent(message, AGENT_IDS.ATTENDANCE_REPORT)
      if (result.success) {
        const parsed = parseAgentResponse<AttendanceReport>(result as unknown as Record<string, unknown>)
        if (parsed) {
          setReport(parsed)
        } else {
          setError('Could not parse the report response. Please try again.')
        }
      } else {
        setError(result.error ?? 'Failed to generate report. Please try again.')
      }
    } catch (e) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
      setActiveAgent(null)
    }
  }, [selectedSubject, setActiveAgent])

  const absentees = Array.isArray(report?.absentee_list) ? report.absentee_list : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Attendance Reports</h2>
        <p className="text-gray-500 mt-1">Generate AI-powered attendance reports by subject</p>
      </div>

      <GlassCard className="p-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Subject</label>
            <select
              value={selectedSubject}
              onChange={e => setSelectedSubject(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
            >
              <option>All Subjects</option>
              {SUBJECTS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-200"
          >
            {loading ? (
              <>
                <FiLoader className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FiFileText className="w-4 h-4" />
                Generate Report
              </>
            )}
          </button>
        </div>
      </GlassCard>

      {error && (
        <InlineMessage type="error" message={error} onDismiss={() => setError(null)} />
      )}

      {loading && (
        <GlassCard className="p-6">
          <LoadingSkeleton lines={6} />
        </GlassCard>
      )}

      {!loading && report && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<FiBook className="w-5 h-5 text-emerald-600" />}
              label="Subject"
              value={report.subject ?? '--'}
              color="bg-emerald-50"
            />
            <StatCard
              icon={<FiUsers className="w-5 h-5 text-blue-600" />}
              label="Total Students"
              value={report.total_students ?? '--'}
              subtext={`${report.present_count ?? 0} present / ${report.absent_count ?? 0} absent`}
              color="bg-blue-50"
            />
            <StatCard
              icon={<FiBarChart2 className="w-5 h-5 text-purple-600" />}
              label="Attendance %"
              value={`${report.attendance_percentage ?? 0}%`}
              color="bg-purple-50"
            />
            <StatCard
              icon={<FiAlertTriangle className="w-5 h-5 text-amber-600" />}
              label="Absent Count"
              value={report.absent_count ?? 0}
              color="bg-amber-50"
            />
          </div>

          {report.trend_summary && (
            <GlassCard className="p-5">
              <div className="flex items-start gap-3">
                <FiTrendingUp className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Trend Summary</h3>
                  <div className="text-sm text-gray-600">{renderMarkdown(report.trend_summary)}</div>
                </div>
              </div>
            </GlassCard>
          )}

          {absentees.length > 0 && (
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <FiUser className="w-4 h-4 text-red-500" />
                Absentee List ({absentees.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase">Student</th>
                    </tr>
                  </thead>
                  <tbody>
                    {absentees.map((s, i) => (
                      <tr key={i} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 px-3 text-gray-400">{i + 1}</td>
                        <td className="py-2 px-3 text-gray-700">{String(s)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          {report.report_summary && (
            <GlassCard className="p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                <FiFileText className="w-4 h-4 text-emerald-600" />
                Report Summary
              </h3>
              <div className="text-sm text-gray-600">{renderMarkdown(report.report_summary)}</div>
            </GlassCard>
          )}
        </div>
      )}

      {!loading && !report && !error && (
        <GlassCard className="p-10 text-center">
          <FiFileText className="w-12 h-12 mx-auto text-emerald-200 mb-3" />
          <h3 className="font-semibold text-gray-700">No Report Generated</h3>
          <p className="text-sm text-gray-400 mt-1">Select a subject and click Generate Report to view attendance data.</p>
        </GlassCard>
      )}
    </div>
  )
}

// ============================================================================
// Student Profiles Tab
// ============================================================================

function StudentProfilesTab({ useSample, setActiveAgent }: { useSample: boolean; setActiveAgent: (id: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<ProfileQuery[]>([])

  useEffect(() => {
    if (useSample && history.length === 0) {
      setHistory([
        { query: 'Show attendance for Roll No 101', result: SAMPLE_PROFILE, timestamp: new Date().toISOString() },
      ])
    }
    if (!useSample) {
      setHistory([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useSample])

  const handleQuery = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setActiveAgent(AGENT_IDS.STUDENT_PROFILE)
    const currentQuery = query.trim()
    setQuery('')

    try {
      const result = await callAIAgent(currentQuery, AGENT_IDS.STUDENT_PROFILE)
      if (result.success) {
        const parsed = parseAgentResponse<StudentProfile>(result as unknown as Record<string, unknown>)
        setHistory(prev => [
          { query: currentQuery, result: parsed, timestamp: new Date().toISOString() },
          ...prev,
        ])
      } else {
        setHistory(prev => [
          { query: currentQuery, result: null, error: result.error ?? 'Failed to fetch profile', timestamp: new Date().toISOString() },
          ...prev,
        ])
      }
    } catch (_e) {
      setHistory(prev => [
        { query: currentQuery, result: null, error: 'An unexpected error occurred', timestamp: new Date().toISOString() },
        ...prev,
      ])
    } finally {
      setLoading(false)
      setActiveAgent(null)
    }
  }, [query, setActiveAgent])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Student Profiles</h2>
        <p className="text-gray-500 mt-1">Search for a student's attendance profile using natural language</p>
      </div>

      <GlassCard className="p-4">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !loading) handleQuery() }}
              placeholder={'e.g. "Show attendance for Roll No 101" or "Show me Rahul\'s attendance"'}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
              disabled={loading}
            />
          </div>
          <button
            onClick={handleQuery}
            disabled={loading || !query.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-200"
          >
            {loading ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />}
          </button>
        </div>
      </GlassCard>

      {loading && (
        <GlassCard className="p-6">
          <LoadingSkeleton lines={5} />
        </GlassCard>
      )}

      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
        {history.map((item, hIdx) => (
          <div key={hIdx} className="space-y-3">
            <div className="flex justify-end">
              <div className="bg-emerald-600 text-white px-4 py-2 rounded-xl rounded-br-sm max-w-[80%] text-sm">
                {item.query}
              </div>
            </div>

            {item.error ? (
              <div className="flex justify-start">
                <InlineMessage type="error" message={item.error} />
              </div>
            ) : item.result ? (
              <div className="flex justify-start w-full">
                <GlassCard className="p-5 w-full max-w-2xl">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{item.result.student_name ?? 'Unknown'}</h3>
                      <p className="text-sm text-gray-500">Roll No: {item.result.roll_number ?? '--'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-xs font-medium px-3 py-1 rounded-full border ${getStatusColor(item.result.status)}`}>
                        {item.result.status ?? 'Unknown'}
                      </span>
                      <span className="text-2xl font-bold text-gray-900">
                        {item.result.overall_attendance_percentage ?? 0}%
                      </span>
                    </div>
                  </div>

                  <div className="mb-2">
                    <ProgressBar
                      value={item.result.overall_attendance_percentage ?? 0}
                      color={(item.result.overall_attendance_percentage ?? 0) >= 75 ? 'bg-emerald-500' : 'bg-red-500'}
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">0%</span>
                      <span className="text-xs text-gray-400">75% threshold</span>
                      <span className="text-xs text-gray-400">100%</span>
                    </div>
                  </div>

                  {Array.isArray(item.result.subject_wise_attendance) && item.result.subject_wise_attendance.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Subject-wise Breakdown</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Attended</th>
                              <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                              <th className="text-right py-2 px-2 text-xs font-semibold text-gray-500 uppercase">%</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.result.subject_wise_attendance.map((sub, sIdx) => (
                              <tr key={sIdx} className="border-b border-gray-100 last:border-0">
                                <td className="py-2 px-2">
                                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getSubjectLightColor(sIdx)}`}>
                                    {sub.subject ?? '--'}
                                  </span>
                                </td>
                                <td className="text-center py-2 px-2 text-gray-700">{sub.classes_attended ?? 0}</td>
                                <td className="text-center py-2 px-2 text-gray-700">{sub.total_classes ?? 0}</td>
                                <td className="text-right py-2 px-2">
                                  <span className={`font-semibold ${(sub.percentage ?? 0) >= 75 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {sub.percentage ?? 0}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 space-y-2">
                        {item.result.subject_wise_attendance.map((sub, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-16 flex-shrink-0">{sub.subject ?? '--'}</span>
                            <ProgressBar value={sub.percentage ?? 0} color={getSubjectColor(sIdx)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.result.remarks && (
                    <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <p className="text-xs font-semibold text-amber-700 mb-1">Remarks</p>
                      <div className="text-sm text-amber-800">{renderMarkdown(item.result.remarks)}</div>
                    </div>
                  )}
                </GlassCard>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {history.length === 0 && !loading && (
        <GlassCard className="p-10 text-center">
          <FiUser className="w-12 h-12 mx-auto text-emerald-200 mb-3" />
          <h3 className="font-semibold text-gray-700">Search for a Student</h3>
          <p className="text-sm text-gray-400 mt-1">
            Try queries like &quot;Show attendance for Roll No 101&quot; or &quot;Show me Rahul&apos;s attendance&quot;
          </p>
        </GlassCard>
      )}
    </div>
  )
}

// ============================================================================
// Alerts Tab
// ============================================================================

function AlertsTab({ useSample, setActiveAgent }: { useSample: boolean; setActiveAgent: (id: string | null) => void }) {
  const [alertData, setAlertData] = useState<AlertResponse | null>(null)
  const [alertLoading, setAlertLoading] = useState(false)
  const [alertError, setAlertError] = useState<string | null>(null)

  // Schedule state
  const [scheduleInfo, setScheduleInfo] = useState<Schedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (useSample) {
      setAlertData(SAMPLE_ALERTS)
    } else {
      setAlertData(null)
    }
  }, [useSample])

  // Load schedule info
  const loadSchedules = useCallback(async () => {
    setScheduleLoading(true)
    setScheduleError(null)
    try {
      const res = await listSchedules({ agentId: AGENT_IDS.ATTENDANCE_ALERT })
      if (res.success && Array.isArray(res.schedules) && res.schedules.length > 0) {
        const found = res.schedules.find(s => s.id === SCHEDULE_ID) ?? res.schedules[0]
        if (found) {
          setScheduleInfo(found)
        }
      } else {
        setScheduleError(res.error ?? 'No schedules found')
      }
    } catch (_e) {
      setScheduleError('Failed to load schedule info')
    } finally {
      setScheduleLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await getScheduleLogs(SCHEDULE_ID, { limit: 5 })
      if (res.success) {
        setLogs(Array.isArray(res.executions) ? res.executions : [])
      }
    } catch (_e) {
      // silent
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSchedules()
    loadLogs()
  }, [loadSchedules, loadLogs])

  const handleToggle = useCallback(async () => {
    if (!scheduleInfo) return
    setToggling(true)
    try {
      if (scheduleInfo.is_active) {
        await pauseSchedule(scheduleInfo.id)
      } else {
        await resumeSchedule(scheduleInfo.id)
      }
      await loadSchedules()
    } catch (_e) {
      setScheduleError('Failed to toggle schedule')
    } finally {
      setToggling(false)
    }
  }, [scheduleInfo, loadSchedules])

  const handleCheckAlerts = useCallback(async () => {
    setAlertLoading(true)
    setAlertError(null)
    setAlertData(null)
    setActiveAgent(AGENT_IDS.ATTENDANCE_ALERT)

    try {
      const result = await callAIAgent(
        'Check all student attendance records against the 75% threshold. Identify students below the threshold in each subject.',
        AGENT_IDS.ATTENDANCE_ALERT
      )
      if (result.success) {
        const parsed = parseAgentResponse<AlertResponse>(result as unknown as Record<string, unknown>)
        if (parsed) {
          setAlertData(parsed)
        } else {
          setAlertError('Could not parse alert response.')
        }
      } else {
        setAlertError(result.error ?? 'Failed to check alerts.')
      }
    } catch (_e) {
      setAlertError('An unexpected error occurred.')
    } finally {
      setAlertLoading(false)
      setActiveAgent(null)
    }
  }, [setActiveAgent])

  const alerts = Array.isArray(alertData?.alerts) ? alertData.alerts : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Alerts & Notifications</h2>
        <p className="text-gray-500 mt-1">Monitor low-attendance alerts and manage scheduled checks</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Alerts Panel */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                <FiAlertTriangle className="w-5 h-5 text-amber-500" />
                Attendance Alerts
              </h3>
              <button
                onClick={handleCheckAlerts}
                disabled={alertLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-emerald-200"
              >
                {alertLoading ? (
                  <>
                    <FiLoader className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <FiRefreshCw className="w-4 h-4" />
                    Check Alerts Now
                  </>
                )}
              </button>
            </div>
          </GlassCard>

          {alertError && (
            <InlineMessage type="error" message={alertError} onDismiss={() => setAlertError(null)} />
          )}

          {alertLoading && (
            <GlassCard className="p-6">
              <LoadingSkeleton lines={5} />
            </GlassCard>
          )}

          {!alertLoading && alertData && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard
                  icon={<FiCalendar className="w-5 h-5 text-blue-600" />}
                  label="Alert Date"
                  value={alertData.alert_date ?? '--'}
                  color="bg-blue-50"
                />
                <StatCard
                  icon={<FiBarChart2 className="w-5 h-5 text-purple-600" />}
                  label="Threshold"
                  value={`${alertData.threshold_percentage ?? 75}%`}
                  color="bg-purple-50"
                />
                <StatCard
                  icon={<FiAlertCircle className="w-5 h-5 text-red-600" />}
                  label="Total Alerts"
                  value={alertData.total_alerts ?? alerts.length}
                  color="bg-red-50"
                />
              </div>

              {alerts.length > 0 && (
                <GlassCard className="p-5">
                  <h4 className="text-sm font-semibold text-gray-800 mb-3">Alert Details</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Student</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Roll No</th>
                          <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Subject</th>
                          <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Attendance</th>
                          <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Missed</th>
                          <th className="text-center py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((a, i) => (
                          <tr key={i} className={`border-b border-gray-100 last:border-0 ${getSeverityClasses(a.severity)} bg-opacity-30`}>
                            <td className="py-2.5 px-2 font-medium text-gray-800">{a.student_name ?? '--'}</td>
                            <td className="py-2.5 px-2 text-gray-600">{a.roll_number ?? '--'}</td>
                            <td className="py-2.5 px-2 text-gray-600">{a.subject ?? '--'}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`font-semibold ${(a.attendance_percentage ?? 0) < 65 ? 'text-red-600' : 'text-amber-600'}`}>
                                {a.attendance_percentage ?? 0}%
                              </span>
                            </td>
                            <td className="py-2.5 px-2 text-center text-gray-600">{a.classes_missed ?? 0}</td>
                            <td className="py-2.5 px-2 text-center">
                              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${getSeverityBadge(a.severity)}`}>
                                {a.severity ?? 'Unknown'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              )}

              {alertData.summary && (
                <GlassCard className="p-5">
                  <h4 className="text-sm font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <FiFileText className="w-4 h-4 text-emerald-600" />
                    Alert Summary
                  </h4>
                  <div className="text-sm text-gray-600">{renderMarkdown(alertData.summary)}</div>
                </GlassCard>
              )}
            </>
          )}

          {!alertLoading && !alertData && !alertError && (
            <GlassCard className="p-10 text-center">
              <FiBell className="w-12 h-12 mx-auto text-emerald-200 mb-3" />
              <h3 className="font-semibold text-gray-700">No Alerts Checked</h3>
              <p className="text-sm text-gray-400 mt-1">Click &quot;Check Alerts Now&quot; to scan for students below the attendance threshold.</p>
            </GlassCard>
          )}
        </div>

        {/* Schedule Panel */}
        <div className="space-y-4">
          <GlassCard className="p-5">
            <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <FiClock className="w-5 h-5 text-emerald-600" />
              Scheduled Checks
            </h3>

            {scheduleLoading ? (
              <LoadingSkeleton lines={4} />
            ) : scheduleError && !scheduleInfo ? (
              <InlineMessage type="error" message={scheduleError} />
            ) : scheduleInfo ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`text-xs font-medium px-3 py-1 rounded-full ${scheduleInfo.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                    {scheduleInfo.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Schedule</span>
                  <span className="text-sm font-medium text-gray-800">
                    {scheduleInfo.cron_expression ? cronToHuman(scheduleInfo.cron_expression) : '--'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Timezone</span>
                  <span className="text-sm text-gray-800">{scheduleInfo.timezone ?? 'Asia/Kolkata'}</span>
                </div>

                {scheduleInfo.next_run_time && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Next Run</span>
                    <span className="text-xs text-gray-700">{new Date(scheduleInfo.next_run_time).toLocaleString()}</span>
                  </div>
                )}

                {scheduleInfo.last_run_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Last Run</span>
                    <span className="text-xs text-gray-700">{new Date(scheduleInfo.last_run_at).toLocaleString()}</span>
                  </div>
                )}

                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${scheduleInfo.is_active ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'}`}
                >
                  {toggling ? (
                    <FiLoader className="w-4 h-4 animate-spin" />
                  ) : scheduleInfo.is_active ? (
                    <>
                      <FiPause className="w-4 h-4" />
                      Pause Schedule
                    </>
                  ) : (
                    <>
                      <FiPlay className="w-4 h-4" />
                      Resume Schedule
                    </>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">No schedule data available</p>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <FiActivity className="w-4 h-4 text-emerald-600" />
                Run History
              </h3>
              <button onClick={loadLogs} disabled={logsLoading} className="text-emerald-600 hover:text-emerald-700">
                <FiRefreshCw className={`w-3.5 h-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {logsLoading ? (
              <LoadingSkeleton lines={3} />
            ) : logs.length > 0 ? (
              <div className="space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-gray-50/50">
                    {log.success ? (
                      <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <FiAlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 truncate">
                        {log.success ? 'Completed' : 'Failed'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(log.executed_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">No execution logs yet</p>
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Create Session Tab
// ============================================================================

function CreateSessionTab({ useSample }: { useSample: boolean }) {
  const [subject, setSubject] = useState('DBMS')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState('60')
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (useSample) {
      setSessions(SAMPLE_SESSIONS)
    } else {
      setSessions([])
    }
  }, [useSample])

  const handleCreate = useCallback(() => {
    if (!date || !time) {
      setFeedback({ type: 'error', message: 'Please select a date and time.' })
      return
    }
    const code = generateCode()
    const newSession: AttendanceSession = {
      id: Date.now().toString(),
      subject,
      code,
      date,
      time,
      duration: parseInt(duration) || 60,
      attendees: [],
    }
    setSessions(prev => [newSession, ...prev])
    setFeedback({ type: 'success', message: `Session created! Code: ${code}` })
    setDate('')
    setTime('')
  }, [subject, date, time, duration])

  const handleCopy = useCallback((sessionCode: string, sessionId: string) => {
    navigator.clipboard.writeText(sessionCode).then(() => {
      setCopiedId(sessionId)
      setTimeout(() => setCopiedId(null), 2000)
    }).catch(() => {
      // fallback
    })
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">Create Session</h2>
        <p className="text-gray-500 mt-1">Set up a new attendance session and generate a check-in code</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FiPlus className="w-5 h-5 text-emerald-600" />
            New Session
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
              <select
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
              >
                {SUBJECTS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={e => setTime(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Duration (minutes)</label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                min={15}
                max={180}
                step={15}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white/80 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all text-sm"
              />
            </div>

            {feedback && (
              <InlineMessage type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />
            )}

            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-all shadow-md shadow-emerald-200"
            >
              <FiPlus className="w-4 h-4" />
              Create Session
            </button>
          </div>
        </GlassCard>

        <GlassCard className="p-6">
          <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <FiCalendar className="w-5 h-5 text-emerald-600" />
            Active Sessions
          </h3>
          {sessions.length > 0 ? (
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {sessions.map(s => (
                <div key={s.id} className="p-4 rounded-lg bg-emerald-50/50 border border-emerald-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getSubjectLightColor(SUBJECTS.indexOf(s.subject as typeof SUBJECTS[number]))}`}>
                        {s.subject}
                      </span>
                      <p className="text-sm text-gray-600 mt-1.5">
                        {s.date} at {s.time} ({s.duration} min)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold text-emerald-700 tracking-wider">{s.code}</span>
                      <button
                        onClick={() => handleCopy(s.code, s.id)}
                        className="p-1.5 rounded-lg hover:bg-emerald-100 transition-colors text-emerald-600"
                        title="Copy code"
                      >
                        {copiedId === s.id ? (
                          <FiCheckCircle className="w-4 h-4" />
                        ) : (
                          <FiCopy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <FiUsers className="w-3 h-3" />
                    {s.attendees.length} checked in
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-400">
              <FiCalendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No active sessions</p>
              <p className="text-xs mt-1">Create a session to generate an attendance code</p>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  )
}

// ============================================================================
// Agent Info Section
// ============================================================================

function AgentInfoSection({ activeAgentId }: { activeAgentId: string | null }) {
  const agents = [
    { id: AGENT_IDS.ATTENDANCE_REPORT, name: 'Attendance Report Agent', purpose: 'Generates subject-wise attendance reports and trends' },
    { id: AGENT_IDS.STUDENT_PROFILE, name: 'Student Profile Agent', purpose: 'Retrieves individual student attendance profiles' },
    { id: AGENT_IDS.ATTENDANCE_ALERT, name: 'Attendance Alert Agent', purpose: 'Checks attendance thresholds and generates alerts' },
  ]

  return (
    <GlassCard className="p-4 mt-6">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">AI Agents</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {agents.map(a => (
          <div
            key={a.id}
            className={`flex items-start gap-2.5 p-2.5 rounded-lg transition-all ${activeAgentId === a.id ? 'bg-emerald-50 border border-emerald-200' : 'bg-gray-50/50'}`}
          >
            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${activeAgentId === a.id ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">{a.name}</p>
              <p className="text-xs text-gray-400 leading-tight mt-0.5">{a.purpose}</p>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function Page() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard')
  const [useSample, setUseSample] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  const navItems: { key: NavTab; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <FiHome className="w-4 h-4" /> },
    { key: 'attendance', label: 'Mark Attendance', icon: <FiCheckCircle className="w-4 h-4" /> },
    { key: 'reports', label: 'Reports', icon: <FiFileText className="w-4 h-4" /> },
    { key: 'profiles', label: 'Student Profiles', icon: <FiUser className="w-4 h-4" /> },
    { key: 'alerts', label: 'Alerts', icon: <FiBell className="w-4 h-4" /> },
    { key: 'sessions', label: 'Create Session', icon: <FiPlus className="w-4 h-4" /> },
  ]

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen font-sans bg-gradient-to-br from-[hsl(160,40%,94%)] via-[hsl(180,35%,93%)] to-[hsl(140,40%,94%)]">
        {/* Mobile Header */}
        <div className="lg:hidden flex items-center justify-between p-4 bg-white/75 backdrop-blur-md border-b border-white/20">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-xl hover:bg-emerald-50 transition-colors">
            {sidebarOpen ? <FiX className="w-5 h-5 text-gray-700" /> : <FiMenu className="w-5 h-5 text-gray-700" />}
          </button>
          <h1 className="text-lg font-bold tracking-tight text-gray-900">AttendEase</h1>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Sample</label>
            <button
              onClick={() => setUseSample(!useSample)}
              className={`relative w-10 h-5 rounded-full transition-colors ${useSample ? 'bg-emerald-500' : 'bg-gray-300'}`}
            >
              <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-transform shadow-sm ${useSample ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <aside className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white/75 backdrop-blur-md border-r border-white/20 shadow-xl lg:shadow-none transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 flex flex-col`}>
            <div className="p-6 border-b border-gray-100">
              <h1 className="text-xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center">
                  <FiCheckCircle className="w-4 h-4 text-white" />
                </div>
                AttendEase
              </h1>
              <p className="text-xs text-gray-400 mt-1">Smart Attendance Tracker</p>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {navItems.map(item => (
                <button
                  key={item.key}
                  onClick={() => { setActiveTab(item.key); setSidebarOpen(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === item.key ? 'bg-emerald-100 text-emerald-800 shadow-sm' : 'text-gray-600 hover:bg-emerald-50 hover:text-emerald-700'}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Sample Data</span>
                <button
                  onClick={() => setUseSample(!useSample)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${useSample ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform shadow-sm ${useSample ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </aside>

          {/* Overlay for mobile sidebar */}
          {sidebarOpen && (
            <div className="fixed inset-0 bg-black/20 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
          )}

          {/* Main Content */}
          <main className="flex-1 min-h-screen lg:min-w-0">
            <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
              {activeTab === 'dashboard' && <DashboardTab useSample={useSample} />}
              {activeTab === 'attendance' && <MarkAttendanceTab useSample={useSample} />}
              {activeTab === 'reports' && <ReportsTab useSample={useSample} setActiveAgent={setActiveAgentId} />}
              {activeTab === 'profiles' && <StudentProfilesTab useSample={useSample} setActiveAgent={setActiveAgentId} />}
              {activeTab === 'alerts' && <AlertsTab useSample={useSample} setActiveAgent={setActiveAgentId} />}
              {activeTab === 'sessions' && <CreateSessionTab useSample={useSample} />}

              <AgentInfoSection activeAgentId={activeAgentId} />
            </div>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
