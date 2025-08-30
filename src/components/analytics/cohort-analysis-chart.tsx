'use client'

import { CohortData } from '@/lib/services/analytics-service'

interface CohortAnalysisChartProps {
  data: CohortData[]
}

export function CohortAnalysisChart({ data }: CohortAnalysisChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        No cohort data available
      </div>
    )
  }

  const getRetentionColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500'
    if (rate >= 60) return 'bg-yellow-500'
    if (rate >= 40) return 'bg-orange-500'
    if (rate >= 20) return 'bg-red-400'
    return 'bg-gray-300'
  }

  const getRetentionTextColor = (rate: number) => {
    if (rate >= 40) return 'text-white'
    return 'text-gray-700'
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-sm text-muted-foreground">
        Customer retention rates by acquisition month (%)
      </div>

      {/* Cohort Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium">Cohort</th>
              <th className="text-center p-2 font-medium">Size</th>
              <th className="text-center p-2 font-medium">Month 1</th>
              <th className="text-center p-2 font-medium">Month 2</th>
              <th className="text-center p-2 font-medium">Month 3</th>
              <th className="text-center p-2 font-medium">Month 4</th>
              <th className="text-center p-2 font-medium">Month 5</th>
              <th className="text-center p-2 font-medium">Month 6</th>
            </tr>
          </thead>
          <tbody>
            {data.map((cohort) => (
              <tr key={cohort.cohortMonth} className="border-t">
                <td className="p-2 font-medium">
                  {cohort.cohortMonth}
                </td>
                <td className="p-2 text-center">
                  {cohort.customersAcquired}
                </td>
                {cohort.retentionRates.map((rate, index) => (
                  <td key={index} className="p-1">
                    <div
                      className={`
                        ${getRetentionColor(rate)} 
                        ${getRetentionTextColor(rate)}
                        rounded px-2 py-1 text-center font-medium
                      `}
                    >
                      {rate.toFixed(0)}%
                    </div>
                  </td>
                ))}
                {/* Fill empty cells if retention data is shorter than 6 months */}
                {Array.from({ length: Math.max(0, 6 - cohort.retentionRates.length) }).map((_, index) => (
                  <td key={`empty-${index}`} className="p-1">
                    <div className="bg-gray-100 rounded px-2 py-1 text-center text-gray-400">
                      -
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span>80%+ Excellent</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
          <span>60-79% Good</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-orange-500 rounded"></div>
          <span>40-59% Fair</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-red-400 rounded"></div>
          <span>20-39% Poor</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-gray-300 rounded"></div>
          <span>&lt;20% Very Poor</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2">
        <h4 className="font-medium text-sm">Cohort Insights</h4>
        <div className="space-y-1 text-xs text-muted-foreground">
          {data.length > 0 && (
            <>
              <p>
                • Latest cohort ({data[data.length - 1].cohortMonth}) acquired{' '}
                {data[data.length - 1].customersAcquired} customers
              </p>
              {data.length > 1 && (
                <p>
                  • Average Month 1 retention:{' '}
                  {(data.reduce((sum, cohort) => sum + (cohort.retentionRates[0] || 0), 0) / data.length).toFixed(1)}%
                </p>
              )}
              {data.some(cohort => cohort.retentionRates.length >= 3) && (
                <p>
                  • Average Month 3 retention:{' '}
                  {(data
                    .filter(cohort => cohort.retentionRates.length >= 3)
                    .reduce((sum, cohort) => sum + cohort.retentionRates[2], 0) / 
                    data.filter(cohort => cohort.retentionRates.length >= 3).length
                  ).toFixed(1)}%
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}