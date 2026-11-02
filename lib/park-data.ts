export type TicketStatus = '待处理' | '处理中' | '已完成';
export type Ticket = { id:string; title:string; location:string; category:string; priority:string; reporter:string; description:string; status:TicketStatus; createdAt:string; updatedAt:string };
export const ticketSeeds:Ticket[] = [
 ['中央空调制冷异常','办公区 2F · A201','设施维修','紧急','林女士','空调运行但温度未下降，请检查设备。','待处理'],
 ['工坊设备用电异常','工坊区 3F · B305','能耗异常','紧急','陈先生','今日电表读数高于历史均值，请安排排查。','待处理'],
 ['会议室投影设备检修','共享区 1F · M102','设施维修','普通','王女士','投影仪无法连接电脑，请协助检查。','待处理'],
 ['走廊照明更换','办公区 2F 东侧','公共设施','普通','张先生','东侧走廊两处灯具不亮。','待处理'],
 ['设备间水管渗漏','设备间 1F','用水异常','紧急','周师傅','设备间管道接口发现轻微渗水。','待处理'],
 ['访客通行申请协助','园区主入口','通行服务','普通','李女士','企业访客需要协助办理通行。','待处理'],
 ['公共区域保洁','共享区 1F','环境保洁','普通','运营团队','活动结束后安排公共区域清洁。','处理中'],
 ['电表巡检','办公区 3F','能耗巡检','普通','运营团队','季度电表巡检与读数校验。','处理中'],
 ['会议室门锁维护','共享区 2F · M201','公共设施','普通','林女士','门锁闭合不顺畅。','处理中'],
 ['休息区饮水机维护','共享区 1F','设施维修','普通','运营团队','饮水机滤芯更换。','已完成'],
 ['园区绿植养护','园区公共区域','环境保洁','普通','运营团队','公共区域绿植养护。','已完成'],
 ['门禁卡登记','办公区 1F','通行服务','普通','陈先生','新入驻企业门禁卡登记。','已完成'],
].map((t,i)=>({id:`ticket-sample-${i+1}`,title:t[0],location:t[1],category:t[2],priority:t[3],reporter:t[4],description:t[5],status:t[6] as TicketStatus,createdAt:`2026-09-09T0${Math.min(i,8)}:00:00.000Z`,updatedAt:`2026-09-09T0${Math.min(i,8)}:00:00.000Z`}));
export const enterprises=[
 {id:'e1',name:'智造未来科技有限公司',short:'智造未来',industry:'智能制造',room:'A201',stage:'成长型',people:28,color:'#478dff',tags:['智能制造','机器人','设备研发'],supply:'工业机器人与自动化设备研发',need:'工业设计与产品外观服务'},
 {id:'e2',name:'创芯科技（深圳）有限公司',short:'创芯科技',industry:'电子信息',room:'B305',stage:'初创型',people:16,color:'#9b7ae7',tags:['芯片设计','物联网','硬件开发'],supply:'低功耗传感器与物联网硬件开发',need:'精密加工与样品试制'},
 {id:'e3',name:'云启智能科技有限公司',short:'云启智能',industry:'人工智能',room:'A403',stage:'成长型',people:35,color:'#30beb5',tags:['人工智能','软件开发','数据分析'],supply:'企业数据分析与智能应用开发',need:'物联网硬件与传感器服务'},
 {id:'e4',name:'未来视界科技有限公司',short:'未来视界',industry:'创意设计',room:'A302',stage:'成长型',people:22,color:'#deae5c',tags:['工业设计','品牌设计','三维建模'],supply:'工业设计与产品外观服务',need:'智能制造企业合作'},
 {id:'e5',name:'绿能科技（深圳）有限公司',short:'绿能科技',industry:'绿色能源',room:'B202',stage:'初创型',people:14,color:'#4dbe8c',tags:['绿色能源','储能','物联网'],supply:'储能与园区能源管理服务',need:'数据分析与智能应用开发'},
 {id:'e6',name:'智慧工坊创新有限公司',short:'智慧工坊',industry:'智能制造',room:'B101',stage:'成长型',people:18,color:'#5fa8d8',tags:['精密加工','样品试制','3D打印'],supply:'精密加工与样品试制',need:'品牌设计与展示服务'},
];
export const spaces=Array.from({length:12},(_,i)=>({id:`A${Math.floor(i/4)+1}0${i%4+1}`,floor:`${Math.floor(i/4)+1}F`,area:[68,86,105,128][i%4],status:i===2||i===7?'空置':i===9?'预留':'已出租',tenant:i===2||i===7||i===9?'—':enterprises[i%6].short,type:i>7?'工坊区':'办公区'}));
export const connections=[{from:'e1',to:'e4',reason:'工业设计需求 ↔ 产品外观设计能力'},{from:'e2',to:'e6',reason:'样品试制需求 ↔ 精密加工能力'},{from:'e3',to:'e2',reason:'传感器需求 ↔ 物联网硬件能力'},{from:'e5',to:'e3',reason:'数据分析需求 ↔ 智能应用能力'},{from:'e6',to:'e4',reason:'品牌展示需求 ↔ 品牌设计能力'},{from:'e4',to:'e1',reason:'制造合作需求 ↔ 智能制造能力'}];
export const energyReadings=[{name:'办公区 1F',electric:356,water:2.1,status:'正常'},{name:'办公区 2F',electric:628,water:3.2,status:'用电偏高'},{name:'办公区 3F',electric:412,water:2.4,status:'正常'},{name:'工坊区 2F',electric:584,water:2.8,status:'正常'},{name:'工坊区 3F',electric:723,water:3.1,status:'用电偏高'},{name:'共享及设备间',electric:142,water:2.0,status:'用水偏高'}];
