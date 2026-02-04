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

  const cpuValue = container?.metrics?.cpu ?? 0
  const memoryValue = container?.metrics?.memory ?? 0
  const memoryLimit = container?.limits?.memoryMB ?? 1

  useEffect(() => {
    const now = new Date()
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const newDataPoint: DataPoint = {
      time: timeString,
      cpu: cpuValue,
      memory: memoryLimit > 0 ? (memoryValue / memoryLimit) * 100 : 0,
    }

    setData((prevData) => {
      const newData = [...prevData, newDataPoint]
      if (newData.length > MAX_DATA_POINTS) {
        return newData.slice(-MAX_DATA_POINTS)
      }
      return newData
    })
  }, [cpuValue, memoryValue, memoryLimit])

  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-terminal-textMuted">
        Waiting for metrics data...
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-terminal-border" />
        <XAxis
          dataKey="time"
          className="text-xs text-terminal-textMuted"
          tick={{ fill: 'currentColor' }}
        />
        <YAxis
          className="text-xs text-terminal-textMuted"
          tick={{ fill: 'currentColor' }}
          domain={[0, 100]}
          label={{ value: '%', position: 'insideLeft' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '0.5rem',
          }}
          labelStyle={{ color: '#c9d1d9' }}
          itemStyle={{ color: '#c9d1d9' }}
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
