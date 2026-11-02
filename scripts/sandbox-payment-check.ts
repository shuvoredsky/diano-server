import { env } from '../src/config/env.config';
import { SslcommerzGateway } from '../src/modules/payments/gateways/sslcommerz.gateway';

async function main() {
  console.info('=================================================================');
  console.info('DIANO E-Commerce — SSLCOMMERZ Sandbox Gateway Diagnostic Check');
  console.info('=================================================================');

  const storeId = env.SSLCOMMERZ_STORE_ID;
  const storePasswd = env.SSLCOMMERZ_STORE_PASSWORD;

  if (!storeId || !storePasswd) {
    console.warn(
      '\n[NOTICE] SSLCOMMERZ credentials are not configured in your .env file.\n' +
        'To test live sandbox session generation, please set:\n' +
        '  SSLCOMMERZ_STORE_ID=your_sandbox_store_id\n' +
        '  SSLCOMMERZ_STORE_PASSWORD=your_sandbox_store_password\n' +
        '  SSLCOMMERZ_IS_LIVE=false\n' +
        '  BACKEND_PUBLIC_URL=https://your-tunnel-url.ngrok-free.app (or localhost:5000)\n',
    );
    process.exit(0);
  }

  console.info(`\nStore ID configured: ${storeId}`);
  console.info('Store Password: ***REDACTED*** (Never logged or printed)');
  console.info('Mode: Sandbox (developer.sslcommerz.com)\n');

  const gateway = new SslcommerzGateway({
    storeId,
    storePasswd,
    isLive: false,
  });

  const testTranId = `TEST-DIAG-${Date.now()}`;
  console.info(`Initiating test session with transaction ID: ${testTranId}...`);

  try {
    const result = await gateway.initialize({
      orderId: 'diag-test-order-001',
      orderNumber: 'DN-261102-00001',
      amount: 1500.0,
      currency: 'BDT',
      transactionId: testTranId,
      customer: {
        name: 'Sandbox Test User',
        email: 'sandbox@diano.test',
        phone: '01700000000',
      },
      shippingAddress: {
        address1: 'House 12, Road 5, Dhanmondi',
        city: 'Dhaka',
        postalCode: '1205',
        country: 'Bangladesh',
      },
    });

    console.info('\n=================================================================');
    console.info('✅ SSLCOMMERZ Sandbox Session Initialized Successfully!');
    console.info('=================================================================');
    console.info(`GatewayPageURL: ${result.gatewayUrl}`);
    console.info(`Session Key:    ${result.sessionKey || 'N/A'}`);
    console.info('=================================================================');
    console.info('Open the GatewayPageURL above in your browser to simulate sandbox checkout.');
    console.info('Use test cards documented in README.md.');
  } catch (error: unknown) {
    console.error('\n❌ SSLCOMMERZ Sandbox Session Initialization Failed:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
  }
}

main().catch(err => {
  console.error('Fatal error during diagnostic check:', err);
  process.exit(1);
});
