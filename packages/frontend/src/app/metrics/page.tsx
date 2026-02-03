'use client'

import { useState, useEffect } from 'react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { useContainers } from '@/hooks/use-containers'
import { useMetrics } from '@/hooks/use-metrics'
import { MetricsDashboardSkeleton } from '@/components/ui/skeleton'
import clsx from 'clsx'

interface HistoricalDataPoint {
  time: string
  avgCpu: number
  avgMemory: number
  totalContainers: number
  runningContainers: number
}

export default function MetricsPage() {
  const { containers, isLoading } = useContainers()
  useMetrics()
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([])

  useEffect(() => {
    if (containers.length === 0) return

    const now = new Date()
    const timeString = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const runningContainers = containers.filter((c) => c.status === 'running')
    const avgCpu = runningContainers.length > 0
      ? runningContainers.reduce((sum, c) => sum + c.metrics.cpu, 0) / runningContainers.length
      : 0
    const avgMemory = runningContainers.length > 0
      ? runningContainers.reduce((sum, c) => {
          const memPercent = (c.metrics.memory / c.limits.memoryMB) * 100
          return sum + memPercent
        }, 0) / runningContainers.length
      : 0

    const newPoint: HistoricalDataPoint = {
      time: timeString,
      avgCpu: Math.round(avgCpu * 10) / 10,
      avgMemory: Math.round(avgMemory * 10) / 10,
      totalContainers: containers.length,
      runningContainers: runningContainers.length,
    }

    setHistoricalData((prev) => {
      const newData = [...prev, newPoint]
      if (newData.length > 30) {
        return newData.slice(-30)
      }
      return newData
    })
  }, [containers])

  if (isLoading) {
    return <MetricsDashboardSkeleton />
  }

  const runningContainers = containers.filter((c) => c.status === 'running')
  const stoppedContainers = containers.filter((c) => c.status === 'stopped')
  const errorContainers = containers.filter((c) => c.status === 'error')

  const totalCpuUsage = runningContainers.reduce((sum, c) => sum + c.metrics.cpu, 0)
  const totalMemoryUsage = runningContainers.reduce((sum, c) => sum + c.metrics.memory, 0)
  const totalMemoryLimit = runningContainers.reduce((sum, c) => sum + c.limits.memoryMB, 0)
  const totalDiskUsage = containers.reduce((sum, c) => sum + c.metrics.disk, 0)
  const totalDiskLimit = containers.reduce((sum, c) => sum + c.limits.diskGB, 0)

  const statusData = [
    { name: 'Running', value: runningContainers.length, color: '#22c55e' },
    { name: 'Stopped', value: stoppedContainers.length, color: '#6b7280' },
    { name: 'Error', value: errorContainers.length, color: '#ef4444' },
  ].filter((item) => item.value > 0)

  const containerMetricsData = runningContainers.map((c) => ({
    name: c.name.length > 15 ? `${c.name.slice(0, 15)}...` : c.name,
    cpu: Math.round(c.metrics.cpu * 10) / 10,
    memory: Math.round((c.metrics.memory / c.limits.memoryMB) * 100 * 10) / 10,
  }))

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Metrics Dashboard
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Monitor aggregate resource usage across all containers
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total CPU Usage
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {totalCpuUsage.toFixed(1)}%
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Across {runningContainers.length} running containers
              </p>
            </div>
            <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-primary-600 dark:text-primary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Memory
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {(totalMemoryUsage / 1024).toFixed(1)} GB
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                of {(totalMemoryLimit / 1024).toFixed(1)} GB allocated
              </p>
            </div>
            <div className="w-12 h-12 bg-success-100 dark:bg-success-900 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-success-600 dark:text-success-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Disk Usage
              </p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                {totalDiskUsage.toFixed(1)} GB
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                of {totalDiskLimit.toFixed(0)} GB allocated
              </p>
            </div>
            <div className="w-12 h-12 bg-warning-100 dark:bg-warning-900 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-warning-600 dark:text-warning-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Container Status
              </p>
              <p className="text-3xl font-bold text-success-600 dark:text-success-400 mt-2">
                {runningContainers.length}/{containers.length}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                containers running
              </p>
            </div>
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-600 dark:text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Historical Usage Chart */}
      {historicalData.length > 1 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Resource Usage Over Time
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={historicalData}>
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
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="avgCpu"
                stroke="#9333ea"
                fill="#9333ea"
                fillOpacity={0.2}
                strokeWidth={2}
                name="Avg CPU %"
              />
              <Area
                type="monotone"
                dataKey="avgMemory"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
                strokeWidth={2}
                name="Avg Memory %"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Container Status Pie Chart */}
        {statusData.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Container Status Distribution
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Per-Container Usage */}
        {containerMetricsData.length > 0 && (
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Per-Container Resource Usage
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={containerMetricsData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
                <XAxis
                  dataKey="name"
                  className="text-xs text-gray-600 dark:text-gray-400"
                  tick={{ fill: 'currentColor', fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  className="text-xs text-gray-600 dark:text-gray-400"
                  tick={{ fill: 'currentColor' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="#9333ea"
                  strokeWidth={2}
                  dot={{ fill: '#9333ea', r: 4 }}
                  name="CPU %"
                />
                <Line
                  type="monotone"
                  dataKey="memory"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  name="Memory %"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Resource Consumers */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Top Resource Consumers
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Container
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Status
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  CPU
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Memory
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-600 dark:text-gray-400">
                  Disk
                </th>
              </tr>
            </thead>
            <tbody>
              {containers
                .sort((a, b) => b.metrics.cpu - a.metrics.cpu)
                .slice(0, 10)
                .map((container) => (
                  <tr
                    key={container.id}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {container.name}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={clsx(
                          'badge',
                          container.status === 'running' && 'badge-success',
                          container.status === 'stopped' && 'badge-gray',
                          container.status === 'error' && 'badge-danger',
                          container.status === 'creating' && 'badge-warning'
                        )}
                      >
                        {container.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={clsx(
                              'h-2 rounded-full',
                              container.metrics.cpu > 80
                                ? 'bg-danger-600'
                                : container.metrics.cpu > 60
                                ? 'bg-warning-600'
                                : 'bg-success-600'
                            )}
                            style={{ width: `${Math.min(container.metrics.cpu, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {container.metrics.cpu.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div
                            className={clsx(
                              'h-2 rounded-full',
                              (container.metrics.memory / container.limits.memoryMB) * 100 > 80
                                ? 'bg-danger-600'
                                : (container.metrics.memory / container.limits.memoryMB) * 100 > 60
                                ? 'bg-warning-600'
                                : 'bg-success-600'
                            )}
                            style={{
                              width: `${Math.min(
                                (container.metrics.memory / container.limits.memoryMB) * 100,
                                100
                              )}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {container.metrics.memory.toFixed(0)} MB
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {container.metrics.disk.toFixed(2)} GB
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
