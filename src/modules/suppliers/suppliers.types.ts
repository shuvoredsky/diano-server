export interface SupplierEntity {
  id: string;
  name: string;
  code: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    purchaseOrders: number;
  };
}

export interface CreateSupplierDto {
  name: string;
  code?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

export interface UpdateSupplierDto {
  name?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

export interface SupplierFilterQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
}

export interface ISuppliersRepository {
  listSuppliers(filter: SupplierFilterQuery): Promise<{ items: SupplierEntity[]; total: number }>;
  findSupplierById(id: string): Promise<SupplierEntity | null>;
  findSupplierByCode(code: string): Promise<SupplierEntity | null>;
  findSupplierByName(name: string, excludeId?: string): Promise<SupplierEntity | null>;
  findSupplierByPhone(phone: string, excludeId?: string): Promise<SupplierEntity | null>;
  createSupplier(data: CreateSupplierDto & { code: string }): Promise<SupplierEntity>;
  updateSupplier(id: string, data: UpdateSupplierDto): Promise<SupplierEntity>;
  softDeleteSupplier(id: string): Promise<SupplierEntity>;
}
