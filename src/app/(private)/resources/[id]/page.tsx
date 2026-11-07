import { notFound } from 'next/navigation';
import { LearningResourceDetail } from '@/components/resources';
import { uuid } from '@/lib/domain';
export default async function ResourcePage({params}:{params:Promise<{id:string}>}){const {id}=await params;try{uuid(id);}catch{notFound();}return <LearningResourceDetail id={id}/>;}
