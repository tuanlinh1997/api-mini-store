/**
 * Vietnamese translations for class-validator's default English messages (NF3), applied
 * globally by the ValidationPipe's exceptionFactory so individual decorators need no message.
 * Messages already written in Vietnamese on a decorator are kept as they are.
 */

const FIELD_LABELS: Record<string, string> = {
  username: 'Tên đăng nhập',
  password: 'Mật khẩu',
  newPassword: 'Mật khẩu mới',
  refreshToken: 'Mã làm mới phiên',
  fullName: 'Họ tên',
  role: 'Vai trò',
  name: 'Tên',
  description: 'Mô tả',
  phone: 'Số điện thoại',
  email: 'Email',
  address: 'Địa chỉ',
  note: 'Ghi chú',
  sku: 'Mã SKU',
  barcode: 'Mã vạch',
  unit: 'Đơn vị tính',
  categoryId: 'Danh mục',
  productId: 'Sản phẩm',
  supplierId: 'Nhà cung cấp',
  customerId: 'Khách hàng',
  cashierId: 'Nhân viên bán hàng',
  salePrice: 'Giá bán',
  costPrice: 'Giá vốn',
  unitCost: 'Đơn giá nhập',
  reorderLevel: 'Ngưỡng cảnh báo tồn thấp',
  quantity: 'Số lượng',
  countedQty: 'Số lượng đếm',
  expectedSystemQty: 'Tồn hệ thống ban đầu',
  reason: 'Lý do',
  items: 'Danh sách hàng',
  payments: 'Danh sách thanh toán',
  method: 'Phương thức',
  amount: 'Số tiền',
  tenderedAmount: 'Tiền khách đưa',
  reference: 'Mã tham chiếu',
  discountAmount: 'Giảm giá',
  receiveNow: 'Nhận hàng ngay',
  search: 'Từ khóa tìm kiếm',
  page: 'Trang',
  pageSize: 'Số dòng mỗi trang',
  limit: 'Giới hạn',
  from: 'Ngày bắt đầu',
  to: 'Ngày kết thúc',
  q: 'Từ khóa',
  code: 'Mã',
  type: 'Loại',
  status: 'Trạng thái',
  isActive: 'Trạng thái hoạt động',
  lowStock: 'Lọc tồn thấp',
  groupBy: 'Nhóm theo',
  sortBy: 'Sắp xếp theo',
};

const NUMBER_PATTERN = /-?\d+(?:\.\d+)?/g;

function lastNumberIn(message: string): string {
  const numbers = message.match(NUMBER_PATTERN);
  return numbers?.[numbers.length - 1] ?? '';
}

export function fieldLabel(property: string): string {
  return FIELD_LABELS[property] ?? property;
}

type Translator = (label: string, english: string, property: string) => string;

const TRANSLATORS: Record<string, Translator> = {
  isDefined: (label) => `${label} là bắt buộc`,
  isNotEmpty: (label) => `${label} không được để trống`,
  isString: (label) => `${label} phải là chuỗi ký tự`,
  isInt: (label) => `${label} phải là số nguyên`,
  isNumber: (label) => `${label} phải là số hợp lệ`,
  isBoolean: (label) => `${label} phải là true hoặc false`,
  isArray: (label) => `${label} phải là một danh sách`,
  isEnum: (label) => `${label} không hợp lệ`,
  isIn: (label) => `${label} không hợp lệ`,
  isEmail: (label) => `${label} không đúng định dạng`,
  matches: (label) => `${label} không đúng định dạng`,
  min: (label, english) => `${label} phải lớn hơn hoặc bằng ${lastNumberIn(english)}`,
  max: (label, english) => `${label} phải nhỏ hơn hoặc bằng ${lastNumberIn(english)}`,
  minLength: (label, english) => `${label} phải có ít nhất ${lastNumberIn(english)} ký tự`,
  maxLength: (label, english) => `${label} không được vượt quá ${lastNumberIn(english)} ký tự`,
  arrayMinSize: (label, english) => `${label} phải có ít nhất ${lastNumberIn(english)} phần tử`,
  arrayMaxSize: (label, english) => `${label} không được vượt quá ${lastNumberIn(english)} phần tử`,
  nestedValidation: (label) => `${label} không hợp lệ`,
  whitelistValidation: (_label, _english, property) =>
    `Trường "${property}" không được phép gửi lên`,
};

/** Anything outside printable ASCII means the decorator already carries a Vietnamese message. */
const HAS_VIETNAMESE_OR_NON_ASCII = /[^ -~]/;

/** Returns a Vietnamese message for one failed constraint (custom Vietnamese messages are kept). */
export function translateConstraint(property: string, constraint: string, message: string): string {
  if (HAS_VIETNAMESE_OR_NON_ASCII.test(message)) {
    return message;
  }
  const translate = TRANSLATORS[constraint];
  return translate
    ? translate(fieldLabel(property), message, property)
    : `${fieldLabel(property)} không hợp lệ`;
}
