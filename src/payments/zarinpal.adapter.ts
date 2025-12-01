import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

interface PaymentInitResponse {
    authority: string;
    paymentUrl: string;
}

interface PaymentVerifyResponse {
    success: boolean;
    refId?: string;
    message?: string;
}

@Injectable()
export class ZarinpalAdapter {
    private readonly MERCHANT_ID: string;
    private readonly ZARINPAL_API_URL: string;
    private readonly ZARINPAL_PAYMENT_URL: string;
    private readonly CALLBACK_URL: string;
    private readonly IS_SANDBOX: boolean;
    private readonly logger = new Logger(ZarinpalAdapter.name);

    constructor(private configService: ConfigService) {
        const sandboxEnv = this.configService.get<string>('ZARINPAL_SANDBOX');
        this.IS_SANDBOX = String(sandboxEnv).toLowerCase() === 'true';
        this.MERCHANT_ID =
            this.configService.get<string>('ZARINPAL_MERCHANT_ID') ||
            '00000000-0000-0000-0000-000000000000';
        this.CALLBACK_URL =
            this.configService.get<string>('ZARINPAL_CALLBACK_URL') ||
            'http://localhost:4001/api/v1/payments/callback';

        if (this.IS_SANDBOX) {
            this.ZARINPAL_API_URL = 'https://sandbox.zarinpal.com/pg/v4/payment';
            this.ZARINPAL_PAYMENT_URL = 'https://sandbox.zarinpal.com/pg/StartPay';
            this.logger.log('🧪 Zarinpal SANDBOX mode enabled');
        } else {
            this.ZARINPAL_API_URL = 'https://api.zarinpal.com/pg/v4/payment';
            this.ZARINPAL_PAYMENT_URL = 'https://www.zarinpal.com/pg/StartPay';
            this.logger.log('🔴 Zarinpal PRODUCTION mode enabled');
        }

        if (!this.MERCHANT_ID || this.MERCHANT_ID.length < 36) {
            this.logger.warn(
                '⚠️ Invalid ZARINPAL_MERCHANT_ID. Using sandbox default.',
            );
        }
    }

    async initiatePayment(
        amount: number,
        email: string,
        description: string = 'Monthly Subscription',
        metadata: Record<string, any> = {},
    ): Promise<PaymentInitResponse> {
        try {
            this.logger.log('💳 Initiating payment:', {
                amount,
                email,
                sandbox: this.IS_SANDBOX,
            });

            const response = await axios.post(
                `${this.ZARINPAL_API_URL}/request.json`,
                {
                    merchant_id: this.MERCHANT_ID,
                    amount: amount,
                    currency: 'IRT',
                    description: description,
                    callback_url: this.CALLBACK_URL,
                    metadata: {
                        email: email,
                        ...metadata,
                    },
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                },
            );

            this.logger.log('✅ Zarinpal response:', response.data);

            const { data } = response.data;

            if (response.data.errors && response.data.errors.length > 0) {
                throw new Error(
                    `Zarinpal Error: ${JSON.stringify(response.data.errors)}`,
                );
            }

            if (!data || !data.authority) {
                throw new Error('Failed to get authority from Zarinpal');
            }

            return {
                authority: data.authority,
                paymentUrl: `${this.ZARINPAL_PAYMENT_URL}/${data.authority}`,
            };
        } catch (error: any) {
            this.logger.error(
                'Zarinpal initiate payment error:',
                error.response?.data || error.message,
            );
            throw new Error(
                `Payment initiation failed: ${error.response?.data?.errors?.[0]?.message || error.message}`,
            );
        }
    }

    async verifyPayment(
        authority: string,
        amount: number,
    ): Promise<PaymentVerifyResponse> {
        try {
            this.logger.log('🔍 Verifying payment:', { authority, amount });

            const response = await axios.post(
                `${this.ZARINPAL_API_URL}/verify.json`,
                {
                    merchant_id: this.MERCHANT_ID,
                    authority: authority,
                    amount: amount,
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                    },
                },
            );

            this.logger.log('✅ Zarinpal verify response:', response.data);

            const { data, errors } = response.data;

            if (errors && errors.length > 0) {
                return {
                    success: false,
                    message: `Verification failed: ${errors[0].message}`,
                };
            }

            if (data && data.code === 100) {
                return {
                    success: true,
                    refId: data.ref_id?.toString(),
                    message: 'Payment verified successfully',
                };
            } else if (data && data.code === 101) {
                return {
                    success: true,
                    refId: data.ref_id?.toString(),
                    message: 'Payment already verified',
                };
            } else {
                return {
                    success: false,
                    message: `Verification failed with code: ${data?.code}`,
                };
            }
        } catch (error: any) {
            this.logger.error(
                'Zarinpal verify payment error:',
                error.response?.data || error.message,
            );
            return {
                success: false,
                message: `Verification error: ${error.response?.data?.errors?.[0]?.message || error.message}`,
            };
        }
    }
}
