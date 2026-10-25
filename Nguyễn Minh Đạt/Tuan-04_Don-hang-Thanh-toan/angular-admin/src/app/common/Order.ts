import { Customer } from "./Customer";

export class Order {
    'ordersId': number;
    'orderDate': Date;
    'amount': number;
    'address': string;
    'phone': string;
    'status': number;
    'paymentMethod': string;
    'paymentStatus': string;
    'paymentReference': string;
    'paymentTransactionId': string;
    'paidAt': Date;
    'user': Customer;
}
