export interface SectionEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  displayOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    products?: number;
    children?: number;
  };
}

export interface SectionTreeItem extends SectionEntity {
  depth: number;
  productCount: number;
  children: SectionTreeItem[];
}

export interface CreateSectionDto {
  name: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
}

export interface UpdateSectionDto {
  name?: string;
  slug?: string;
  description?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  displayOrder?: number;
  isActive?: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
}

export interface ReorderSectionItem {
  id: string;
  displayOrder: number;
  parentId?: string | null;
}

export interface SectionProductAssignmentItem {
  productId: string;
  sortOrder?: number;
}

export interface AssignSectionProductsDto {
  productIds?: string[];
  items?: SectionProductAssignmentItem[];
}

export interface ReorderSectionProductsDto {
  items: Array<{
    productId: string;
    sortOrder: number;
  }>;
}

export interface ISectionsRepository {
  findById(id: string): Promise<SectionEntity | null>;
  findBySlug(slug: string): Promise<SectionEntity | null>;
  findAll(includeInactive?: boolean): Promise<SectionEntity[]>;
  create(data: CreateSectionDto & { slug: string }): Promise<SectionEntity>;
  update(id: string, data: UpdateSectionDto): Promise<SectionEntity>;
  delete(id: string): Promise<SectionEntity>;
  reorder(items: ReorderSectionItem[]): Promise<void>;
  getAncestors(id: string): Promise<SectionEntity[]>;
  getDescendantIds(id: string): Promise<string[]>;
  countChildren(parentId: string): Promise<number>;
  countProducts(sectionId: string): Promise<number>;
  assignProducts(
    sectionId: string,
    items: Array<{ productId: string; sortOrder: number }>,
  ): Promise<void>;
  removeProduct(sectionId: string, productId: string): Promise<void>;
  reorderProducts(
    sectionId: string,
    items: Array<{ productId: string; sortOrder: number }>,
  ): Promise<void>;
  getSectionProducts(
    sectionId: string,
    page: number,
    limit: number,
  ): Promise<{ items: unknown[]; total: number }>;
  syncProductSections(productId: string, sectionIds: string[]): Promise<void>;
}

