'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Phone, ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'

const phoneSchema = z.object({
    phone: z.string().regex(/^\+?[\d\s-()]+$/, 'Please enter a valid phone number')
})

const otpSchema = z.object({
    otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must contain only numbers')
})

type PhoneFormData = z.infer<typeof phoneSchema>
type OTPFormData = z.infer<typeof otpSchema>

interface OTPFormProps {
    onSuccess?: (userData: any) => void
    onBack?: () => void
    purpose?: 'login' | 'registration' | 'verification'
    tenantId?: string
}

export function OTPForm({
    onSuccess,
    onBack,
    purpose = 'login',
    tenantId
}: OTPFormProps) {
    const [step, setStep] = useState<'phone' | 'otp'>('phone')
    const [phone, setPhone] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [countdown, setCountdown] = useState(0)
    const [canResend, setCanResend] = useState(true)
    const otpInputRefs = useRef<(HTMLInputElement | null)[]>([])

    const phoneForm = useForm<PhoneFormData>({
        resolver: zodResolver(phoneSchema)
    })

    const otpForm = useForm<OTPFormData>({
        resolver: zodResolver(otpSchema)
    })

    // Countdown timer for resend OTP
    useEffect(() => {
        let timer: NodeJS.Timeout
        if (countdown > 0) {
            timer = setTimeout(() => setCountdown(countdown - 1), 1000)
        } else {
            setCanResend(true)
        }
        return () => clearTimeout(timer)
    }, [countdown])

    const sendOTP = async (phoneNumber: string) => {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/auth/otp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone: phoneNumber,
                    purpose
                }),
            })

            const data = await response.json()

            if (data.success) {
                setPhone(phoneNumber)
                setStep('otp')
                setCountdown(60) // 60 seconds countdown
                setCanResend(false)
            } else {
                setError(data.error?.message || 'Failed to send OTP')
            }
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const verifyOTP = async (otpCode: string) => {
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/auth/otp/verify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone,
                    otp: otpCode,
                    purpose,
                    tenantId
                }),
            })

            const data = await response.json()

            if (data.success) {
                onSuccess?.(data.data)
            } else {
                setError(data.error?.message || 'Invalid OTP')
            }
        } catch (err) {
            setError('Network error. Please try again.')
        } finally {
            setIsLoading(false)
        }
    }

    const onPhoneSubmit = async (data: PhoneFormData) => {
        await sendOTP(data.phone)
    }

    const onOTPSubmit = async (data: OTPFormData) => {
        await verifyOTP(data.otp)
    }

    const handleResendOTP = async () => {
        if (canResend && phone) {
            await sendOTP(phone)
        }
    }

    const handleOTPChange = (index: number, value: string) => {
        if (value.length <= 1 && /^\d*$/.test(value)) {
            const newOTP = otpForm.getValues('otp') || ''
            const otpArray = newOTP.split('')
            otpArray[index] = value
            const updatedOTP = otpArray.join('')

            otpForm.setValue('otp', updatedOTP)

            // Auto-focus next input
            if (value && index < 5) {
                otpInputRefs.current[index + 1]?.focus()
            }

            // Auto-submit when all 6 digits are entered
            if (updatedOTP.length === 6) {
                otpForm.handleSubmit(onOTPSubmit)()
            }
        }
    }

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !e.currentTarget.value && index > 0) {
            otpInputRefs.current[index - 1]?.focus()
        }
    }

    if (step === 'phone') {
        return (
            <div className="w-full max-w-md space-y-6">
                <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                        <Phone className="w-6 h-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {purpose === 'login' ? 'Sign in with Phone' : 'Verify Phone Number'}
                    </h1>
                    <p className="text-muted-foreground">
                        We'll send you a verification code to confirm your phone number
                    </p>
                </div>

                {error && (
                    <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <div className="relative">
                            <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="phone"
                                type="tel"
                                placeholder="+91 98765 43210"
                                className="pl-10"
                                {...phoneForm.register('phone')}
                                disabled={isLoading}
                                autoComplete="tel"
                                autoFocus
                            />
                        </div>
                        {phoneForm.formState.errors.phone && (
                            <p className="text-sm text-destructive">
                                {phoneForm.formState.errors.phone.message}
                            </p>
                        )}
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending OTP...
                            </>
                        ) : (
                            'Send OTP'
                        )}
                    </Button>
                </form>

                {onBack && (
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={onBack}
                        disabled={isLoading}
                    >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to login
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div className="w-full max-w-md space-y-6">
            <div className="text-center space-y-2">
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <Phone className="w-6 h-6 text-primary" />
                </div>
                <h1 className="text-2xl font-bold tracking-tight">Enter verification code</h1>
                <p className="text-muted-foreground">
                    We sent a 6-digit code to{' '}
                    <span className="font-medium">{phone}</span>
                </p>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <form onSubmit={otpForm.handleSubmit(onOTPSubmit)} className="space-y-6">
                <div className="space-y-2">
                    <Label>Verification Code</Label>
                    <div className="flex justify-center space-x-2">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                            <Input
                                key={index}
                                ref={(el) => (otpInputRefs.current[index] = el)}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                className="w-12 h-12 text-center text-lg font-semibold"
                                onChange={(e) => handleOTPChange(index, e.target.value)}
                                onKeyDown={(e) => handleKeyDown(index, e)}
                                disabled={isLoading}
                                autoComplete="one-time-code"
                            />
                        ))}
                    </div>
                    {otpForm.formState.errors.otp && (
                        <p className="text-sm text-destructive text-center">
                            {otpForm.formState.errors.otp.message}
                        </p>
                    )}
                </div>

                <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Verifying...
                        </>
                    ) : (
                        'Verify Code'
                    )}
                </Button>
            </form>

            <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                    Didn't receive the code?
                </p>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleResendOTP}
                    disabled={!canResend || isLoading}
                    className="text-primary hover:text-primary/80"
                >
                    {!canResend ? (
                        `Resend in ${countdown}s`
                    ) : (
                        <>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Resend OTP
                        </>
                    )}
                </Button>
            </div>

            <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep('phone')}
                disabled={isLoading}
            >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Change phone number
            </Button>
        </div>
    )
}