import { beforeEach, describe, expect, it } from 'vitest';
import {
  archiveTask,
  createTask,
  deleteTask,
  getTasksByBucket,
  moveTask,
} from '@/lib/storage';

describe('task ordering', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('moves tasks between buckets and reindexes both lists', () => {
    const first = createTask('Primera', 'stove_main');
    const second = createTask('Segunda', 'stove_main');
    const sinkTask = createTask('Fregar', 'sink');

    moveTask(second.id, 'sink', 0);

    expect(getTasksByBucket('stove_main').map(task => ({
      id: task.id,
      orderIndex: task.orderIndex,
    }))).toEqual([
      { id: first.id, orderIndex: 0 },
    ]);

    expect(getTasksByBucket('sink').map(task => ({
      id: task.id,
      orderIndex: task.orderIndex,
    }))).toEqual([
      { id: second.id, orderIndex: 0 },
      { id: sinkTask.id, orderIndex: 1 },
    ]);
  });

  it('reorders tasks inside the same bucket', () => {
    const first = createTask('Primera', 'stove_main');
    const second = createTask('Segunda', 'stove_main');
    const third = createTask('Tercera', 'stove_main');

    moveTask(third.id, 'stove_main', 0);

    expect(getTasksByBucket('stove_main').map(task => ({
      id: task.id,
      orderIndex: task.orderIndex,
    }))).toEqual([
      { id: third.id, orderIndex: 0 },
      { id: first.id, orderIndex: 1 },
      { id: second.id, orderIndex: 2 },
    ]);
  });

  it('reindexes visible tasks after archive and delete', () => {
    const first = createTask('Primera', 'stove_main');
    const second = createTask('Segunda', 'stove_main');
    const third = createTask('Tercera', 'stove_main');

    archiveTask(first.id);
    deleteTask(second.id);

    expect(getTasksByBucket('stove_main').map(task => ({
      id: task.id,
      orderIndex: task.orderIndex,
    }))).toEqual([
      { id: third.id, orderIndex: 0 },
    ]);
  });
});
