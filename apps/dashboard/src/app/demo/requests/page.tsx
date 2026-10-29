import type { Metadata } from 'next';
import { DemoRequests } from '../DemoRequests';

export const metadata: Metadata = {
  title: 'Live demo · Requests'
};

export default function DemoRequestsPage({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) {
  const request = Array.isArray(searchParams.request) ? searchParams.request[0] : searchParams.request;
  return <DemoRequests initialRequestId={request} />;
}
