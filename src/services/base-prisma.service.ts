import { PrismaService } from '@services/prisma.service';
import { PrismaSingleton } from '@services/prisma-singleton.service';

export interface IPaginatedResponse<T> {
  data: T[];
  meta: {
    pages: number;
    page: number;
    count: number;
    limit: number;
    offset: number;
  };
}

export class BasePrismaService {
  public prisma: PrismaService;
  constructor() {
    this.prisma = PrismaSingleton.getInstance();
  }

  formatResultToPaginatedResponse(
    result: any,
    count: number,
    limit: number,
    offset: number,
  ): IPaginatedResponse<any> {
    return formatResultToPaginatedResponse(result, count, limit, offset);
  }
}

export function formatResultToPaginatedResponse(
  result: any,
  count: number,
  limit: number,
  offset: number,
): IPaginatedResponse<any> {
  const pages = Math.ceil(count / limit);
  const page = Math.ceil(offset / limit) + 1;
  return {
    data: result,
    meta: {
      pages,
      page,
      count,
      limit,
      offset,
    },
  };
}
