import { PrismaService } from '@services/prisma.service';

export class PrismaSingleton {
  public prisma: PrismaService;
  private static instance: PrismaService;

  private constructor() {
    this.prisma = new PrismaService();
  }

  public static getInstance(): PrismaService {
    if (!PrismaSingleton.instance) {
      const instance = new PrismaSingleton();

      PrismaSingleton.instance = instance.prisma;
    }

    return PrismaSingleton.instance;
  }
}
