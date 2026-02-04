'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/api-client'
import type { Container, MetricsHistoryPoint } from '@/lib/types'

interface MetricsChartProps {
  container: Container
}

interface DataPoint {
  time: string
  timestamp: string
  cpu: number
  memory: number
  disk: number
}

const MAX_DATA_POINTS = 300 // 5 hours at 1 min interval

// Colors
const COLORS = {
  cpu: '#9333ea',    // purple
  memory: '#3b82f6', // blue
  disk: '#22c55e',   // green
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatTimeWithSeconds(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload || !label) {
    return null
  }

  return (
    <div className="bg-terminal-bg border border-terminal-border rounded-lg p-3 shadow-lg">
      <p className="text-terminal-textMuted text-xs mb-2">{label}</p>
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-terminal-text">
            {entry.name}: {entry.value.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  )
}

export function MetricsChart({ container }: MetricsChartProps) {
  const { t } = useI18n()
  const [data, setData] = useState<DataPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visibleLines, setVisibleLines] = useState({
    cpu: true,
    memory: true,
    disk: true,
  })

  // Fetch historical data on mount
  const fetchHistory = useCallback(async () => {
    if (!container?.id) return

    setIsLoading(true)
    setError(null)

    try {
      const response = await apiClient.getMetricsHistory(container.id, 5)

      if (response.success && response.data) {
        // Get disk limit for percentage calculation (history returns disk in GB)
        const diskLimitGB = container.limits?.diskGB ?? 1

        const historyData: DataPoint[] = response.data.map((point: MetricsHistoryPoint) => {
          // Convert disk from GB to percentage
          const diskPercent = diskLimitGB > 0 ? (point.disk / diskLimitGB) * 100 : 0

          return {
            time: formatTime(point.timestamp),
            timestamp: point.timestamp,
            cpu: point.cpu,
            memory: point.memory,
            disk: Math.min(diskPercent, 100),
          }
        })

        setData(historyData)
      } else {
        // No history yet - start with empty array
        setData([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics history')
    } finally {
      setIsLoading(false)
    }
  }, [container?.id, container?.limits?.diskGB])

  // Fetch history on mount
  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Add real-time updates from container.metrics
  const cpuValue = container?.metrics?.cpu ?? 0
  const memoryValue = container?.metrics?.memory ?? 0
  const diskValue = container?.metrics?.disk ?? 0
  const memoryLimit = container?.limits?.memoryMB ?? 1
  const diskLimit = container?.limits?.diskGB ?? 1

  useEffect(() => {
    // Only add new points after initial load is complete
    if (isLoading) return

    const now = new Date()
    const timestamp = now.toISOString()

    // Calculate memory percentage
    const memoryPercent = memoryLimit > 0 ? (memoryValue / memoryLimit) * 100 : 0
    // Calculate disk percentage (diskValue is already in GB)
    const diskPercent = diskLimit > 0 ? (diskValue / diskLimit) * 100 : 0

    const newDataPoint: DataPoint = {
      time: formatTimeWithSeconds(timestamp),
      timestamp,
      cpu: cpuValue,
      memory: Math.min(memoryPercent, 100),
      disk: Math.min(diskPercent, 100),
    }

    setData((prevData) => {
      // Don't add duplicate timestamps (within 1 second)
      if (prevData.length > 0) {
        const lastPoint = prevData[prevData.length - 1]
        if (lastPoint) {
          const lastTime = new Date(lastPoint.timestamp).getTime()
          const newTime = new Date(timestamp).getTime()
          if (Math.abs(newTime - lastTime) < 1000) {
            return prevData
          }
        }
      }

      const newData = [...prevData, newDataPoint]
      if (newData.length > MAX_DATA_POINTS) {
        return newData.slice(-MAX_DATA_POINTS)
      }
      return newData
    })
  }, [cpuValue, memoryValue, diskValue, memoryLimit, diskLimit, isLoading])

  // Toggle line visibility
  const handleLegendClick = (dataKey: string) => {
    setVisibleLines(prev => ({
      ...prev,
      [dataKey]: !prev[dataKey as keyof typeof prev],
    }))
  }

  // Custom legend with clickable items
  const renderLegend = () => {
    return (
      <div className="flex justify-center gap-6 mt-2">
        <button
          onClick={() => handleLegendClick('cpu')}
          className={`flex items-center gap-2 text-sm transition-opacity ${
            visibleLines.cpu ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: COLORS.cpu }}
          />
          <span className="text-terminal-text">{t.metricsChart.cpu} %</span>
        </button>
        <button
          onClick={() => handleLegendClick('memory')}
          className={`flex items-center gap-2 text-sm transition-opacity ${
            visibleLines.memory ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: COLORS.memory }}
          />
          <span className="text-terminal-text">{t.metricsChart.memory} %</span>
        </button>
        <button
          onClick={() => handleLegendClick('disk')}
          className={`flex items-center gap-2 text-sm transition-opacity ${
            visibleLines.disk ? 'opacity-100' : 'opacity-40'
          }`}
        >
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: COLORS.disk }}
          />
          <span className="text-terminal-text">{t.metricsChart.disk} %</span>
        </button>
      </div>
    )
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="h-[350px] flex flex-col items-center justify-center text-terminal-textMuted">
        <div className="animate-pulse flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-terminal-border border-t-terminal-accent rounded-full animate-spin" />
          <span>{t.metricsChart.loading}</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="h-[350px] flex items-center justify-center text-red-400">
        <span>{error}</span>
      </div>
    )
  }

  // No data state
  if (data.length === 0) {
    return (
      <div className="h-[350px] flex items-center justify-center text-terminal-textMuted">
        <span>{t.metricsChart.noData}</span>
      </div>
    )
  }

  // Calculate tick interval for X axis (show label every 30 minutes)
  const tickInterval = Math.max(1, Math.floor(data.length / 10))

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center px-4">
        <span className="text-sm text-terminal-textMuted">{t.metricsChart.last5Hours}</span>
        <span className="text-xs text-terminal-textMuted">
          {data.length} {data.length === 1 ? 'point' : 'points'}
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#30363d"
            opacity={0.5}
          />
          <XAxis
            dataKey="time"
            tick={{ fill: '#8b949e', fontSize: 11 }}
            tickLine={{ stroke: '#30363d' }}
            axisLine={{ stroke: '#30363d' }}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fill: '#8b949e', fontSize: 11 }}
            tickLine={{ stroke: '#30363d' }}
            axisLine={{ stroke: '#30363d' }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={renderLegend} />

          {visibleLines.cpu && (
            <Line
              type="monotone"
              dataKey="cpu"
              stroke={COLORS.cpu}
              strokeWidth={2}
              dot={false}
              name={`${t.metricsChart.cpu} %`}
              animationDuration={300}
            />
          )}

          {visibleLines.memory && (
            <Line
              type="monotone"
              dataKey="memory"
              stroke={COLORS.memory}
              strokeWidth={2}
              dot={false}
              name={`${t.metricsChart.memory} %`}
              animationDuration={300}
            />
          )}

          {visibleLines.disk && (
            <Line
              type="monotone"
              dataKey="disk"
              stroke={COLORS.disk}
              strokeWidth={2}
              dot={false}
              name={`${t.metricsChart.disk} %`}
              animationDuration={300}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
