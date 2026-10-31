export interface CategoryEntity {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  parentId: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    products?: number;
    children?: number;
  };
}

export interface CategoryTreeItem extends CategoryEntity {
  depth: number;
  productCount: number;
  children: CategoryTreeItem[];
}

export interface BreadcrumbItem {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryDetailResponse extends CategoryEntity {
  productCount: number;
  breadcrumbs: BreadcrumbItem[];
  children: CategoryEntity[];
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  image?: string;
  parentId?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateCategoryDto {
  name?: string;
  slug?: string;
  description?: string | null;
  image?: string | null;
  parentId?: string | null;
  isFeatured?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface ReorderCategoryItem {
  id: string;
  sortOrder: number;
}

export interface ICategoriesRepository {
  findById(id: string): Promise<CategoryEntity | null>;
  findBySlug(slug: string): Promise<CategoryEntity | null>;
  findAll(includeInactive?: boolean): Promise<CategoryEntity[]>;
  create(data: CreateCategoryDto & { slug: string }): Promise<CategoryEntity>;
  update(id: string, data: UpdateCategoryDto): Promise<CategoryEntity>;
  softDelete(id: string): Promise<CategoryEntity>;
  reorder(items: ReorderCategoryItem[]): Promise<void>;
  countChildren(parentId: string): Promise<number>;
  countActiveProducts(categoryId: string): Promise<number>;
  reassignProducts(fromCategoryId: string, toCategoryId: string): Promise<number>;
  reassignChildren(fromParentId: string, toParentId: string | null): Promise<number>;
  getAncestors(categoryId: string): Promise<CategoryEntity[]>;
  getDescendantIds(categoryId: string): Promise<string[]>;
}
