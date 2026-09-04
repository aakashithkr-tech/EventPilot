import { Task } from '../types/index';
import { api } from './api';

export interface CreateTaskPayload {
  title: string;
  description?: string;
  assigneeId?: string;
  dueDate?: string;
  priority: Task['priority'];
  status: Task['status'];
  requirementId?: string;
}

class TaskService {
  async list(eventId: string): Promise<Task[]> {
    const result = await api.get<{ tasks: Task[] }>(`/events/${eventId}/tasks`);
    return result.tasks;
  }

  async create(eventId: string, payload: CreateTaskPayload): Promise<Task> {
    const result = await api.post<{ task: Task }>(`/events/${eventId}/tasks`, payload);
    return result.task;
  }

  async update(taskId: string, updates: Partial<CreateTaskPayload>): Promise<Task> {
    const result = await api.patch<{ task: Task }>(`/tasks/${taskId}`, updates);
    return result.task;
  }

  async remove(taskId: string): Promise<void> {
    await api.delete(`/tasks/${taskId}`);
  }
}

export const taskService = new TaskService();
