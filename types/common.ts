export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

export interface ActionResult<T> {
  data?: T;
  error?: string;
  fields?: Record<string, string[] | undefined>;
}

export interface Timestamps {
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TenantScoped {
  companyId: string;
}

export interface ListOptions {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
}
