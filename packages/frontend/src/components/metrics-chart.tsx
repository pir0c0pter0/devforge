'use client'

import { useState, useEffect } from 'react'
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
import type { Container } from '@/lib/types'

interface MetricsChartProps {
  container: Container
}

interface DataPoint {
  time: string
  cpu: number
  memory: number
}

const MAX_DATA_POINTS = 20

export function MetricsChart({ container }: MetricsChartProps) {
  const [data, setData] = useState<DataPoint[]>([])

  useEffect(() => {
    const now = new Date()
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const newDataPoint: DataPoint = {
      time: timeString,
      cpu: container.metrics.cpu,
      memory: (container.metrics.memory / container.limits.memoryMB) * 100,
    }

    setData((prevData) => {
      const newData = [...prevData, newDataPoint]
      if (newData.length > MAX_DATA_POINTS) {
        return newData.slice(-MAX_DATA_POINTS)
      }
      return newData
    })
  }, [container.metrics.cpu, container.metrics.memory, container.limits.memoryMB])

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
        Waiting for metrics data...
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
        <XAxis
          dataKey="time"
          className="text-xs text-gray-600 dark:text-gray-400"
          tick={{ fill: 'currentColor' }}
        />
        <YAxis
          className="text-xs text-gray-600 dark:text-gray-400"
          tick={{ fill: 'currentColor' }}
          domain={[0, 100]}
          label={{ value: '%', position: 'insideLeft' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid #e5e7eb',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: '#374151' }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="cpu"
          stroke="#9333ea"
          strokeWidth={2}
          dot={false}
          name="CPU %"
        />
        <Line
          type="monotone"
          dataKey="memory"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={false}
          name="Memory %"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
