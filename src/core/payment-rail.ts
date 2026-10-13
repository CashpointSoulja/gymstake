import type { PaymentRail } from './types';

export class SimulationPaymentRail implements PaymentRail {
  readonly kind = 'simulation' as const;
  private readonly requests = new Map<string, { signature: string; reference: string }>();

  private apply(operation: string, input: { userId: string; amountPence: number; idempotencyKey: string; commitmentId?: string }): { reference: string } {
    if (!input.userId || !input.idempotencyKey) throw new TypeError('A user and idempotency key are required.');
    if (!Number.isSafeInteger(input.amountPence) || input.amountPence <= 0) {
      throw new RangeError('The amount must be a positive whole number of pence.');
    }
    const signature = JSON.stringify([operation, input.userId, input.commitmentId ?? null, input.amountPence]);
    const previous = this.requests.get(input.idempotencyKey);
    if (previous && previous.signature !== signature) throw new Error('An idempotency key cannot be reused for a different request.');
    const result = previous ?? { signature, reference: `simulation:${operation}:${encodeURIComponent(input.idempotencyKey)}` };
    this.requests.set(input.idempotencyKey, result);
    return { reference: result.reference };
  }

  async lockStake(input: { userId: string; commitmentId: string; amountPence: number; idempotencyKey: string }): Promise<{ reference: string }> {
    if (!input.commitmentId) throw new TypeError('A commitment is required.');
    return this.apply('lock', input);
  }

  async release(input: { userId: string; amountPence: number; idempotencyKey: string }): Promise<{ reference: string }> {
    return this.apply('release', input);
  }
}
