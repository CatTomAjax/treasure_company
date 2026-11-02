import { BUILD_INFO } from '@/lib/build-info';
export async function GET() {
  return Response.json(
    { ...BUILD_INFO, database: 'mysql8', tablePrefix: 'treasure_' },
    {
      headers: { 'Cache-Control': 'no-store, max-age=0', Pragma: 'no-cache' },
    },
  );
}
