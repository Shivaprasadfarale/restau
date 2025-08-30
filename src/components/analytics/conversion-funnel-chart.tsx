'use client'

import { ConversionFunnel } from '@/lib/services/analytics-service'
import { Eye, ShoppingCart, CreditCard, CheckCircle } from 'lucide-react'

interface ConversionFunnelChartProps {
  data: ConversionFunnel
}

export function ConversionFunnelChart({ data }: ConversionFunnelChartProps) {
  const funnelSteps = [
    {
      label: 'Views',
      value: data.views,
      icon: Eye,
      color: 'bg-blue-500',
      percentage: 100
    },
    {
      label: 'Add to Cart',
      value: data.addToCarts,
      icon: ShoppingCart,
      color: 'bg-green-500',
      percentage: data.viewToCartRate
    },
    {
      label: 'Checkout',
      value: data.checkouts,
      icon: CreditCard,
      color: 'bg-orange-500',
      percentage: data.cartToCheckoutRate
    },
    {
      label: 'Payment',
      value: data.payments,
      icon: CheckCircle,
      color: 'bg-purple-500',
      percentage: data.checkoutToPaymentRate
    }
  ]

  const maxValue = Math.max(...funnelSteps.map(step => step.value))

  if (maxValue === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No conversion data available
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <div className="space-y-3">
        {funnelSteps.map((step, index) => {
          const width = maxValue > 0 ? (step.value / maxValue) * 100 : 0
          const Icon = step.icon
          
          return (
            <div key={step.label} className="space-y-2">
              {/* Step Header */}
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{step.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{step.value.toLocaleString()}</span>
                  {index > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ({step.percentage.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="relative">
                <div className="w-full bg-gray-200 rounded-full h-8">
                  <div
                    className={`${step.color} h-8 rounded-full transition-all duration-500 flex items-center justify-end pr-3`}
                    style={{ width: `${width}%` }}
                  >
                    <span className="text-white text-xs font-medium">
                      {step.value > 0 && `${step.value}`}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Drop-off indicator */}
              {index < funnelSteps.length - 1 && (
                <div className="flex justify-center">
                  <div className="text-xs text-muted-foreground bg-gray-100 px-2 py-1 rounded">
                    {((funnelSteps[index + 1].value / step.value) * 100).toFixed(1)}% continue
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Summary Metrics */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">
            {data.overallConversionRate.toFixed(1)}%
          </div>
          <div className="text-sm text-muted-foreground">
            Overall Conversion Rate
          </div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">
            {data.views > 0 ? ((data.addToCarts / data.views) * 100).toFixed(1) : 0}%
          </div>
          <div className="text-sm text-muted-foreground">
            View to Cart Rate
          </div>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-2">
        <h4 className="font-medium text-sm">Insights</h4>
        <div className="space-y-1 text-xs text-muted-foreground">
          {data.viewToCartRate < 10 && (
            <p>• Low view-to-cart rate suggests menu items may need better presentation or pricing</p>
          )}
          {data.cartToCheckoutRate < 70 && (
            <p>• Cart abandonment is high - consider simplifying the checkout process</p>
          )}
          {data.checkoutToPaymentRate < 80 && (
            <p>• Payment completion rate could be improved with better payment options</p>
          )}
          {data.overallConversionRate > 5 && (
            <p>• Great overall conversion rate! Your funnel is performing well</p>
          )}
        </div>
      </div>
    </div>
  )
}